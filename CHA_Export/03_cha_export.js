import fs from 'fs';
import path from 'path';
import { login } from './01_login.js';
import { convertExcelToJson } from './02_read_xl.js';

(async () => {

  // 🔁 STEP 1 + STEP 2 (PARALLEL)
  await Promise.all([
    convertExcelToJson(),  // fast CPU task
  ]);

  // 🔐 STEP 3 (LOGIN)
  const { browser, page } = await login();

  const jsonDir = './input_json';

  const jsonFiles = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

  console.log(`📊 Processing ${jsonFiles.length} JSON files`);

  // 🔧 Helpers
  const safeClick = async (locator) => {
    await locator.waitFor({ state: 'visible' });
    await locator.click();
  };

  const safeFill = async (locator, value) => {
    await locator.waitFor({ state: 'visible' });
    await locator.fill(value || '');
  };

  for (const file of jsonFiles) {
    console.log(`\n📂 File: ${file}`);

    const data = JSON.parse(
      fs.readFileSync(path.join(jsonDir, file), 'utf-8')
    );

    const rows = Array.isArray(data)
      ? data
      : Object.values(data).flat();

    for (const row of rows) {
      const exporter = row['Exporter Name'] || row['Exporter'] || row['Exporter_Name'];

      if (!exporter) continue;

      console.log(`🚀 Creating job for: ${exporter}`);

      await page.goto(`${process.env.BASE_URL}/export-ccm`, {
        waitUntil: 'networkidle'
      });

      await safeClick(page.locator('span.plus[nztooltiptitle="Add Job"]'));

      const dropdown = page.locator('xemi-dropdown[controlname="importer_name"]');
      await safeClick(dropdown);

      // Function to try searching and returning if options exist
      const trySearch = async (searchTerm) => {
        await safeFill(dropdown.locator('input'), searchTerm);
        await page.waitForTimeout(1500);
        
        const result = await Promise.race([
          page.waitForSelector('nz-option-item', { state: 'visible', timeout: 5000 }).then(() => 'found'),
          page.waitForSelector('text="No Data"', { state: 'visible', timeout: 5000 }).then(() => 'empty').catch(() => 'empty')
        ]);
        return result === 'found';
      };

      try {
        let found = await trySearch(exporter);
        if (!found) {
          // Fallback: search by the first 2 words
          const shortName = exporter.split(' ').slice(0, 2).join(' ');
          console.log(`⚠️ Full name not found, trying shorter name: ${shortName}`);
          found = await trySearch(shortName);
        }

        if (found) {
          await safeClick(page.locator('nz-option-item').first());
        } else {
          console.log(`❌ Exporter not found in dropdown: ${exporter}. Skipping job.`);
          continue;
        }
      } catch (err) {
        console.error('Failed on dropdown logic:', err.message);
        continue;
      }

      // ✈️ Mode
      const rawMode = row['Mode'] || row['Mode_Of_Transport'] || 'Air';
      const mode = typeof rawMode === 'string' && rawMode.toLowerCase().startsWith('s') ? 'sea' : 'air';

      try {
        // Based on the provided HTML, Sea is the 1st span and Air is the 2nd span
        const childIndex = mode === 'sea' ? 1 : 2;
        const modeLocator = page.locator(`.top-applied-filters-list-2 span:nth-child(${childIndex})`).first();
        
        await modeLocator.click({ timeout: 3000 });
      } catch (err) {
        console.log(`⚠️ Mode selector for ${mode} not found or clicking timed out. Continuing...`);
      }

      // 📂 Upload
      try {
        await safeClick(page.locator('button[nztooltiptitle="Upload File"]'));
        
        await page.waitForSelector('text="Browse Files"', { state: 'visible', timeout: 5000 });
        const fileInput = page.locator('input[type="file"]');
        
        // Dynamically map the Excel file from input_excel matching the current JSON file
        const fs = await import('fs');
        const path = await import('path');
        let uploadFilePath = path.join(process.cwd(), 'input_excel', file.replace('.json', '.xlsx'));
        
        // Fallback to .xls if .xlsx doesn't exist
        if (!fs.existsSync(uploadFilePath)) {
          uploadFilePath = path.join(process.cwd(), 'input_excel', file.replace('.json', '.xls'));
        }
        
        await fileInput.setInputFiles(uploadFilePath);
        
        // Wait briefly for file to be staged in the UI, then click the confirm Upload button
        await page.waitForTimeout(1000);
        const confirmUpload = page.getByRole('button', { name: 'Upload', exact: true });
        await confirmUpload.click();
        
        // Wait for modal to disappear
        await page.waitForSelector('text="Upload Document"', { state: 'hidden', timeout: 60000 });
        
        // Per user request: 60 seconds pause after uploading before clicking continue
        console.log('Taking a 60-second pause after upload...');
        await page.waitForTimeout(60000);
      } catch (err) {
        console.log(`⚠️ Problem during Upload step: ${err.message}`);
      }

      // Handle the optional Exchange Rates SweetAlert popup that might appear after upload
      try {
        const swalPopup = page.locator('.swal2-popup');
        // We wait up to 5 seconds to see if it's on the screen
        await swalPopup.waitFor({ state: 'visible', timeout: 5000 });
        
        const swalTitle = await swalPopup.locator('.swal2-title').textContent();
        if (swalTitle && swalTitle.includes('Exchange rates have recently changed')) {
          console.log('Exchange rates popup detected! Clicking Yes...');
          await swalPopup.locator('.swal2-confirm').click();
          await page.waitForTimeout(2000); // Wait for modal to disappear
        } else {
          console.log('Different SweetAlert detected: ' + swalTitle);
          // Optional: we can dismiss it if there's a confirm button, to avoid blocking the continue button
          await swalPopup.locator('.swal2-confirm').click();
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // No SweetAlert popup appeared
      }

      // Click the first Continue button on the Setup page to initiate the redirect to the next step
      await safeClick(page.locator('button.continue-btn').first());
      console.log('Clicked first Continue button, waiting for redirect to Shipment Details...');

      // Ensure we have actually redirected to the Shipment Details page
      await page.waitForSelector('h3:has-text("Shipment Details")', { state: 'visible', timeout: 60000 });
      
      // Wait a moment for any page loaders / nz-spins to settle
      await page.waitForTimeout(2000);
      
      // Click the second Continue button on the redirected page (Shipment Details)
      console.log('Clicking Continue on Shipment Details page...');
      await safeClick(page.locator('button.continue-btn').last());
      
      // Handle the optional SweetAlert duplicate invoice popup
      try {
        const swalConfirm = page.locator('.swal2-popup .swal2-confirm');
        await swalConfirm.waitFor({ state: 'visible', timeout: 3000 });
        console.log('Duplicate Invoice Popup detected! Clicking Yes...');
        await swalConfirm.click();
      } catch (e) {
        // Safe to ignore if no popup appears
      }
      
      // Wait for the next redirect to Order Details
      console.log('Waiting for Order Details page...');
      await page.waitForSelector('h3:has-text("Order Details")', { state: 'visible', timeout: 30000 });
      await page.waitForTimeout(2000); // Wait for loaders
      
      // Click the third Continue button on the Order Details page
      console.log('Clicking Continue on Order Details page...');
      await safeClick(page.locator('button.continue-btn').last());
      
      // Handle optional SweetAlert popup here as well just in case
      try {
        const swalConfirm = page.locator('.swal2-popup .swal2-confirm');
        await swalConfirm.waitFor({ state: 'visible', timeout: 3000 });
        console.log('Duplicate Invoice Popup detected! Clicking Yes...');
        await swalConfirm.click();
      } catch (e) {
        // Safe to ignore if no popup appears
      }

      // Wait for the next redirect to Product Details
      console.log('Waiting for Product Details page to load data...');
      await page.waitForSelector('h3:has-text("Product Details")', { state: 'visible', timeout: 30000 });
      
      // Wait to ensure all background data is fully loaded
      await page.waitForTimeout(4000); 

      // Click the fourth Continue button (Save & Continue)
      console.log('Clicking Save & Continue on Product Details page...');
      await safeClick(page.locator('button.continue-btn:has-text("Save & Continue"), button.continue-btn').last());
      
      // Handle the optional SweetAlert invoice mismatch popup
      try {
        const swalConfirm = page.locator('.swal2-popup .swal2-confirm');
        await swalConfirm.waitFor({ state: 'visible', timeout: 3000 });
        console.log('Invoice Mismatch Popup detected! Clicking Yes...');
        await swalConfirm.click();
      } catch (e) {
        // Safe to ignore if no popup appears
      }

      // Wait for the next redirect to Supporting Document
      console.log('Waiting for Supporting Document page (this can take time)...');
      await page.waitForSelector('h3:has-text("Supporting Document")', { state: 'visible', timeout: 90000 });
      await page.waitForTimeout(2000); // Wait for loaders
      
      // Click the fifth Continue button on the Supporting Document page
      console.log('Clicking Continue on Supporting Document page...');
      await safeClick(page.locator('button.continue-btn').last());

      // Wait for the next redirect to Review page
      console.log('Waiting for Review page...');
      await page.waitForSelector('button:has-text("Flat File")', { state: 'visible', timeout: 30000 });
      await page.waitForTimeout(2000); // Wait for loaders
      
      console.log('Clicking Flat File dropdown...');
      await safeClick(page.locator('button.review_btn:has-text("Flat File"), button:has-text("Flat File")').first());

      console.log('Clicking Download JSON...');
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(e => console.log('⚠️ No download event detected or timed out.'));
      await safeClick(page.locator('li.ant-dropdown-menu-item:has-text("Download JSON")'));
      
      const download = await downloadPromise;
      if (download) {
        const fs = await import('fs');
        const path = await import('path');
        
        const downloadDir = path.join(process.cwd(), 'Output_json');
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
        }
        
        // Target format: x{OriginalFileName}.json
        const downloadPath = path.join(downloadDir, `x${file}`);
        await download.saveAs(downloadPath);
        console.log(`✅ File successfully downloaded to: ${downloadPath}`);
      }

      // --- Download the .sb FlatFile ---
      await page.waitForTimeout(1000); // Short pause before clicking the dropdown again

      console.log('Clicking Flat File dropdown again...');
      await safeClick(page.locator('button.review_btn:has-text("Flat File"), button:has-text("Flat File")').first());

      console.log('Clicking Create FlatFile...');
      const sbDownloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(e => console.log('⚠️ No download event detected for SB flatfile.'));
      await safeClick(page.locator('li.ant-dropdown-menu-item:has-text("Create FlatFile")'));
      
      const sbDownload = await sbDownloadPromise;
      if (sbDownload) {
        const fs = await import('fs');
        const path = await import('path');
        
        const sbDownloadDir = path.join(process.cwd(), 'output_sb');
        if (!fs.existsSync(sbDownloadDir)) {
          fs.mkdirSync(sbDownloadDir, { recursive: true });
        }
        
        // Use the original json filename prefixed with 'x' and ending in '.sb'
        const expectedFileName = `x${file.replace('.json', '.sb')}`;
        const sbDownloadPath = path.join(sbDownloadDir, expectedFileName);
        await sbDownload.saveAs(sbDownloadPath);
        console.log(`✅ .sb FlatFile successfully downloaded to: ${sbDownloadPath}`);
      }

      // Wait a bit before shutting down
      await page.waitForTimeout(3000);
      
      console.log("✅ Job done");
    }
  }

  console.log("\n🎉 ALL DONE");

  await browser.close();
})();