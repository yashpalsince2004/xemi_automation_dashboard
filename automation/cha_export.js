import 'dotenv/config';
import { chromium } from 'playwright';

(async () => {

  const browser = await chromium.launch({ headless:false, channel: 'chrome' });

  const page = await browser.newPage();

  await page.goto(process.env.BASE_URL + '/auth/login');

  await page.fill('#email', process.env.Email1);

  await page.fill('#password', process.env.Password1);

  await page.click('button[type="submit"]');

  // Wait for dashboard to load after login
  await page.waitForTimeout(1000);

  // Navigate directly to the Freight job page
  await page.goto(process.env.BASE_URL + '/export-ccm');

  // Wait for the Freight job page to load
  await page.waitForTimeout(1000);

  // Click on Add Shipment button
  await page.locator('a:has-text("Add Shipment")').click();
  // Wait for the modal to open
  await page.waitForTimeout(1000);

  // Click Air button
  await page.locator('.top-applied-filters-list', { hasText: 'Air' }).click();

  // Click Export button
  await page.locator('.top-applied-filters-list', { hasText: 'Export' }).click();
  
  // Wait for the upload element to appear
  await page.waitForTimeout(1000);

  // Click the file upload dropzone
  await page.locator('.upload_icon').click();

  // Wait a bit to observe the action
  await page.waitForTimeout(2000);

})();