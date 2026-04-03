/**
 * ============================================================================
 *  Auto_export_xl.js — Batch CHA Export Automation (v2)
 * ============================================================================
 *
 *  Automates the Xemi CHA Export workflow for up to 500+ Excel files.
 *
 *  v2 Enhancements:
 *   - Persistent session management (login once, auto re-login if expired)
 *   - Missing field detection & structured logging (missing_fields_log.json)
 *   - Retry with exponential backoff on transient failures
 *   - Smart waits (spinner/network detection instead of hardcoded delays)
 *   - Fault-tolerant: skips problematic steps, never stops the batch
 *   - Comprehensive summary with login, missing field, and error stats
 *
 *  Usage:
 *    node Auto_export_xl.js                      # Batch — all files
 *    node Auto_export_xl.js --file=myfile.xlsx    # Single file
 *    node Auto_export_xl.js --help                # Show usage
 *
 *  Environment Variables (all optional, set in ../.env):
 *    BATCH_SIZE       — Max files per run (0 = unlimited, default: 0)
 *    INPUT_DIR        — Input folder (default: ./input_excel)
 *    OUTPUT_SB_DIR    — SB output folder (default: ./output_sb)
 *    HEADLESS         — Run browser headless (default: false)
 *    UPLOAD_WAIT_MS   — Pause after upload in ms (default: 60000)
 *
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { login, ensureSession } from './user_login.js';
import { convertSingleExcelToJson } from './Xl_to_json.js';
import {
  retry,
  safeClick,
  safeFill,
  smartWait,
  handleSweetAlert,
  FieldValidator,
  BatchLogger,
  ProgressBar,
} from './utils.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  inputDir:      process.env.INPUT_DIR        || './input_excel',
  jsonDir:       './input_json',
  outputSbDir:   process.env.OUTPUT_SB_DIR    || './output_sb',
  batchSize:     parseInt(process.env.BATCH_SIZE || '0', 10),
  headless:      process.env.HEADLESS === 'true',
  uploadWaitMs:  parseInt(process.env.UPLOAD_WAIT_MS || '60000', 10),
};

// ─── Shared state ───────────────────────────────────────────────────────────

const logger = new BatchLogger();
const fieldValidator = new FieldValidator();

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

/**
 * Parse --file=<name> from process.argv for single-file mode.
 * @returns {string|null} filename or null for batch mode
 */
function parseCLIArgs() {
  const fileArg = process.argv.find(a => a.startsWith('--file='));
  if (fileArg) {
    return fileArg.split('=')[1];
  }

  if (process.argv.includes('--help')) {
    console.log(`
Usage:
  node Auto_export_xl.js                   Batch mode — process all Excel files
  node Auto_export_xl.js --file=abc.xlsx   Single file mode

Environment Variables:
  BATCH_SIZE       Max files per run (0 = all)
  INPUT_DIR        Input folder path (default: ./input_excel)
  OUTPUT_SB_DIR    SB output folder (default: ./output_sb)
  HEADLESS         Run headless browser (true/false)
  UPLOAD_WAIT_MS   Pause after upload in ms (default: 60000)
    `);
    process.exit(0);
  }

  return null;
}

// ─── Input Handling ─────────────────────────────────────────────────────────

/**
 * Read all valid Excel files from the input directory.
 * Filters for .xls/.xlsx, sorts alphabetically.
 *
 * @param {string} inputDir - Path to the input directory.
 * @returns {string[]} Sorted list of Excel filenames.
 */
function readInputFiles(inputDir) {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${path.resolve(inputDir)}`);
  }

  const stat = fs.statSync(inputDir);
  if (!stat.isDirectory()) {
    throw new Error(`Input path is not a directory: ${path.resolve(inputDir)}`);
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.xlsx' || ext === '.xls';
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  if (files.length === 0) {
    throw new Error(`No Excel files (.xls/.xlsx) found in: ${path.resolve(inputDir)}`);
  }

  return files;
}

// ─── Per-File Processing ────────────────────────────────────────────────────

/**
 * Process a single Excel file through the full CHA Export workflow.
 *
 * Each step is wrapped in its own try/catch so a failure in one step
 * (e.g., missing mode selector) skips only that step, not the entire file.
 *
 * @param {import('playwright').Page} page
 * @param {string} fileName - Excel filename (e.g., "abc.xlsx")
 * @param {object} config   - Configuration object
 * @returns {Promise<{success: boolean, error?: string, missingFields?: number}>}
 */
async function processFile(page, fileName, config) {
  const baseName = path.basename(fileName, path.extname(fileName));
  const excelPath = path.join(config.inputDir, fileName);
  let stepErrors = [];

  // ── Step 1: Convert Excel → JSON ──────────────────────────────────────
  console.log(`    📄 Converting Excel to JSON...`);
  const convResult = convertSingleExcelToJson(excelPath, config.jsonDir);
  if (!convResult.success) {
    return { success: false, error: `Excel conversion failed: ${convResult.error}` };
  }

  // ── Step 2: Read JSON data ────────────────────────────────────────────
  const jsonPath = path.join(config.jsonDir, `${baseName}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Failed to read JSON: ${err.message}` };
  }

  const rows = Array.isArray(data) ? data : Object.values(data).flat();

  if (rows.length === 0) {
    return { success: false, error: 'No data rows found in the Excel file' };
  }

  // ── Step 3: Process each row (job) ────────────────────────────────────
  for (const row of rows) {
    // ── Validate required fields using FieldValidator ────────────────
    const exporter = fieldValidator.check(fileName, row, 'Exporter Name', [
      'Exporter Name', 'Exporter', 'Exporter_Name',
    ]);

    if (!exporter) {
      console.log(`    ⚠️ Missing exporter field. Skipping row.`);
      continue;
    }

    // Validate other fields (log missing ones but continue)
    const rawMode = fieldValidator.check(fileName, row, 'Mode of Transport', [
      'Mode', 'Mode_Of_Transport', 'Transport_Mode',
    ]);

    console.log(`    🚀 Creating job for: ${exporter}`);

    // ── Navigate to Export CCM ────────────────────────────────────────
    try {
      await retry(async () => {
        await page.goto(`${process.env.BASE_URL}/export-ccm`, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
      }, { retries: 2, label: 'Navigate to export-ccm' });
    } catch (err) {
      stepErrors.push(`Navigation failed: ${err.message}`);
      continue; // Skip this row entirely
    }

    // ── Click "Add Job" ──────────────────────────────────────────────
    try {
      await safeClick(page.locator('span.plus[nztooltiptitle="Add Job"]'));
    } catch (err) {
      stepErrors.push(`Add Job button failed: ${err.message}`);
      continue;
    }

    // ── Exporter Dropdown (with retry) ───────────────────────────────
    let exporterFound = false;
    try {
      const dropdown = page.locator('xemi-dropdown[controlname="importer_name"]');
      await safeClick(dropdown);

      const trySearch = async (searchTerm) => {
        await safeFill(dropdown.locator('input'), searchTerm);
        await page.waitForTimeout(1500);

        const result = await Promise.race([
          page.waitForSelector('nz-option-item', { state: 'visible', timeout: 5000 })
            .then(() => 'found'),
          page.waitForSelector('text="No Data"', { state: 'visible', timeout: 5000 })
            .then(() => 'empty').catch(() => 'empty'),
        ]);
        return result === 'found';
      };

      exporterFound = await trySearch(exporter);
      if (!exporterFound) {
        const shortName = exporter.split(' ').slice(0, 2).join(' ');
        console.log(`    ⚠️ Full name not found, trying: ${shortName}`);
        exporterFound = await trySearch(shortName);
      }

      if (exporterFound) {
        await safeClick(page.locator('nz-option-item').first());
      } else {
        console.log(`    ❌ Exporter not found in dropdown: ${exporter}. Skipping.`);
        continue;
      }
    } catch (err) {
      stepErrors.push(`Dropdown error for "${exporter}": ${err.message}`);
      console.error(`    ❌ Dropdown error: ${err.message}`);
      continue;
    }

    // ── Transport Mode (fault-tolerant — missing mode won't stop flow) ─
    try {
      const mode = typeof rawMode === 'string' && rawMode.toLowerCase().startsWith('s') ? 'sea' : 'air';
      const childIndex = mode === 'sea' ? 1 : 2;
      const modeLocator = page.locator(`.top-applied-filters-list-2 span:nth-child(${childIndex})`).first();
      await modeLocator.click({ timeout: 3000 });
    } catch {
      console.log(`    ⚠️ Mode selector not found. Using default. Continuing...`);
    }

    // ── Upload Excel File (with retry on transient failures) ─────────
    try {
      await retry(async () => {
        await safeClick(page.locator('button[nztooltiptitle="Upload File"]'));
        await page.waitForSelector('text="Browse Files"', { state: 'visible', timeout: 5000 });

        const fileInput = page.locator('input[type="file"]');
        let uploadFilePath = path.join(process.cwd(), config.inputDir, fileName);

        if (!fs.existsSync(uploadFilePath)) {
          const altExt = path.extname(fileName) === '.xlsx' ? '.xls' : '.xlsx';
          uploadFilePath = path.join(process.cwd(), config.inputDir, baseName + altExt);
        }

        if (!fs.existsSync(uploadFilePath)) {
          throw new Error(`Upload file not found: ${uploadFilePath}`);
        }

        await fileInput.setInputFiles(uploadFilePath);
        await page.waitForTimeout(1000);

        const confirmUpload = page.getByRole('button', { name: 'Upload', exact: true });
        await confirmUpload.click();

        await page.waitForSelector('text="Upload Document"', { state: 'hidden', timeout: 60000 });
      }, { retries: 2, label: 'File upload' });

      // Configurable pause after upload
      console.log(`    ⏳ Upload pause (${config.uploadWaitMs / 1000}s)...`);
      await page.waitForTimeout(config.uploadWaitMs);
    } catch (err) {
      stepErrors.push(`Upload failed: ${err.message}`);
      console.log(`    ⚠️ Upload error: ${err.message}. Attempting to continue...`);
    }

    // ── Exchange Rates Popup (click "No") ────────────────────────────
    await handleSweetAlert(page, 'Exchange Rates', 5000, false);

    // ── Navigate multi-step form (each step is fault-tolerant) ───────
    const navigationSteps = [
      {
        label: 'Shipment Details',
        clickSelector: 'button.continue-btn',
        clickPosition: 'first',
        waitSelector: 'h3:has-text("Shipment Details")',
        waitTimeout: 60000,
        popupLabel: null,
      },
      {
        label: 'Order Details',
        clickSelector: 'button.continue-btn',
        clickPosition: 'last',
        waitSelector: 'h3:has-text("Order Details")',
        waitTimeout: 30000,
        popupLabel: 'Duplicate Invoice',
      },
      {
        label: 'Product Details',
        clickSelector: 'button.continue-btn',
        clickPosition: 'last',
        waitSelector: 'h3:has-text("Product Details")',
        waitTimeout: 30000,
        popupLabel: 'Duplicate Invoice',
        extraWaitMs: 2000, // Extra time for product data to load
      },
      {
        label: 'Supporting Document',
        clickSelector: 'button.continue-btn:has-text("Save & Continue"), button.continue-btn',
        clickPosition: 'last',
        waitSelector: 'h3:has-text("Supporting Document")',
        waitTimeout: 90000,
        popupLabel: 'Invoice Mismatch',
      },
      {
        label: 'Review',
        clickSelector: 'button.continue-btn',
        clickPosition: 'last',
        waitSelector: 'button:has-text("Flat File")',
        waitTimeout: 30000,
        popupLabel: null,
      },
    ];

    let navigationFailed = false;
    for (const step of navigationSteps) {
      try {
        console.log(`    → Navigating to ${step.label}...`);

        // Click the continue button
        const btnLocator = page.locator(step.clickSelector);
        const btn = step.clickPosition === 'first' ? btnLocator.first() : btnLocator.last();

        await retry(async () => {
          await safeClick(btn);
        }, { retries: 1, label: `Click continue → ${step.label}` });

        // Handle optional popup
        if (step.popupLabel) {
          await handleSweetAlert(page, step.popupLabel);
        }

        // Wait for next page to load
        await page.waitForSelector(step.waitSelector, {
          state: 'visible',
          timeout: step.waitTimeout,
        });

        // Smart wait for loaders/spinners instead of hardcoded delay
        await smartWait(page, { timeout: 8000, fallbackMs: 2000 });

        // Extra wait if needed for data loading
        if (step.extraWaitMs) {
          await page.waitForTimeout(step.extraWaitMs);
        }
      } catch (err) {
        stepErrors.push(`Navigation to ${step.label} failed: ${err.message}`);
        console.error(`    ❌ Failed navigating to ${step.label}: ${err.message}`);
        navigationFailed = true;
        break; // Can't continue navigation if a step fails
      }
    }

    if (navigationFailed) {
      console.log(`    ⚠️ Navigation chain broken. Skipping output download for this job.`);
      continue;
    }

    // ── Download Outputs ─────────────────────────────────────────────
    try {
      await generateOutputs(page, baseName, config);
    } catch (err) {
      stepErrors.push(`Output download failed: ${err.message}`);
      console.error(`    ⚠️ Output download error: ${err.message}`);
    }

    await page.waitForTimeout(2000);
    console.log(`    ✅ Job complete for: ${exporter}`);
  }

  // Report step-level errors but consider the file successful if at least
  // some jobs were processed without critical failure
  const fileMissingFields = fieldValidator.getForFile(fileName).length;

  if (stepErrors.length > 0) {
    return {
      success: false,
      error: `${stepErrors.length} step error(s): ${stepErrors[0]}`,
      missingFields: fileMissingFields,
    };
  }

  return { success: true, missingFields: fileMissingFields };
}

// ─── Output Generation ──────────────────────────────────────────────────────

/**
 * Download the .sb flat file from the Review page.
 * Wrapped in retry for transient download failures.
 *
 * @param {import('playwright').Page} page
 * @param {string} baseName - File base name (no extension)
 * @param {object} config   - Configuration object
 */
async function generateOutputs(page, baseName, config) {
  // Ensure output directory exists
  if (!fs.existsSync(config.outputSbDir)) {
    fs.mkdirSync(config.outputSbDir, { recursive: true });
  }

  // ── Download .sb ───────────────────────────────────────────────────
  await page.waitForTimeout(1000);

  try {
    console.log('    📥 Downloading .sb FlatFile...');
    await retry(async () => {
      await safeClick(
        page.locator('button.review_btn:has-text("Flat File"), button:has-text("Flat File")').first()
      );

      const sbDownloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await safeClick(page.locator('li.ant-dropdown-menu-item:has-text("Create FlatFile")'));

      // Wait for popup after Create FlatFile click
      await page.waitForTimeout(1000);
      const swalPopup = page.locator('.swal2-popup');
      await swalPopup.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      const popupCount = await swalPopup.count();
      if (popupCount > 0) {
        console.log('    🔔 Handling Rewards warning popup...');
        await swalPopup.locator('.swal2-confirm').click({ timeout: 5000 });
        console.log('    ✓ Clicked OK on popup');
        await page.waitForTimeout(1000);
      }

      const sbDownload = await sbDownloadPromise;
      const downloadPath = path.join(config.outputSbDir, `x${baseName}.sb`);
      await sbDownload.saveAs(downloadPath);
      console.log(`    ✅ SB saved: ${downloadPath}`);
    }, { retries: 2, label: 'SB download' });
  } catch (err) {
    console.log(`    ⚠️ SB download failed: ${err.message}`);
  }
}

// ─── Batch Orchestrator ─────────────────────────────────────────────────────

/**
 * Main entry point — orchestrates the full batch processing run.
 *
 * Flow:
 *  1. Parse CLI args
 *  2. Read & validate input files
 *  3. Login (with session persistence)
 *  4. Process files sequentially with session health checks
 *  5. Write error log + missing fields log
 *  6. Print comprehensive summary
 */
async function runBatch() {
  const singleFile = parseCLIArgs();

  // ── Determine file list ────────────────────────────────────────────
  let files;
  try {
    if (singleFile) {
      const fullPath = path.join(CONFIG.inputDir, singleFile);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ File not found: ${fullPath}`);
        process.exit(1);
      }
      files = [singleFile];
      console.log(`\n🎯 Single file mode: ${singleFile}`);
    } else {
      files = readInputFiles(CONFIG.inputDir);

      if (CONFIG.batchSize > 0 && files.length > CONFIG.batchSize) {
        console.log(`📦 Batch size limit: processing ${CONFIG.batchSize} of ${files.length} files`);
        files = files.slice(0, CONFIG.batchSize);
      }

      console.log(`\n📦 Batch mode: ${files.length} file(s) queued`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log(`📂 Input:  ${path.resolve(CONFIG.inputDir)}`);
  console.log(`📤 SB:     ${path.resolve(CONFIG.outputSbDir)}`);
  console.log('');

  // ── Progress bar ───────────────────────────────────────────────────
  const progressBar = new ProgressBar(files.length);

  // ── Login (persistent session) ─────────────────────────────────────
  let browser, context, page;
  try {
    const result = await login({ headless: CONFIG.headless });
    browser = result.browser;
    context = result.context;
    page = result.page;
    logger.logLogin(result.method);
  } catch (err) {
    logger.logLoginFailed(err.message);
    console.error(`❌ Login failed: ${err.message}`);
    process.exit(1);
  }

  // ── Process files sequentially ─────────────────────────────────────
  progressBar.start();

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const index = i + 1;
    const total = files.length;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  [${index}/${total}] Processing: ${fileName}`);
    console.log(`${'═'.repeat(60)}`);

    // ── Session health check every 10 files ──────────────────────────
    if (i > 0 && i % 10 === 0) {
      try {
        const sessionResult = await ensureSession(browser, page, context);
        page = sessionResult.page;
        context = sessionResult.context;
        if (sessionResult.reloginOccurred) {
          logger.logRelogin();
        }
      } catch (err) {
        console.error(`❌ Re-login failed: ${err.message}. Stopping batch.`);
        break;
      }
    }

    // ── Process the file ─────────────────────────────────────────────
    const fileStart = Date.now();
    try {
      const result = await processFile(page, fileName, CONFIG);
      const duration = ((Date.now() - fileStart) / 1000).toFixed(1);

      if (result.success) {
        logger.addResult(fileName, 'success', {
          missingFields: result.missingFields || 0,
          duration: `${duration}s`,
        });
        progressBar.tick('success');
        console.log(`  ✅ [${index}/${total}] SUCCESS: ${fileName} (${duration}s)`);
      } else {
        logger.addResult(fileName, 'failed', {
          error: result.error,
          missingFields: result.missingFields || 0,
          duration: `${duration}s`,
        });
        progressBar.tick('failed');
        console.error(`  ❌ [${index}/${total}] FAILED: ${fileName} — ${result.error}`);
      }
    } catch (err) {
      const errorMsg = err.message || String(err);
      const duration = ((Date.now() - fileStart) / 1000).toFixed(1);
      logger.addResult(fileName, 'failed', { error: errorMsg, duration: `${duration}s` });
      progressBar.tick('failed');
      console.error(`  ❌ [${index}/${total}] FAILED: ${fileName} — ${errorMsg}`);

      // Check if this was a browser crash (page/context destroyed)
      try {
        await page.title(); // Quick health check
      } catch {
        console.log('  🔄 Browser context appears dead. Attempting recovery...');
        try {
          const sessionResult = await ensureSession(browser, page, context);
          page = sessionResult.page;
          context = sessionResult.context;
          logger.logRelogin();
          console.log('  ✅ Browser recovered. Continuing batch.');
        } catch (recoveryErr) {
          console.error(`  ❌ Browser recovery failed: ${recoveryErr.message}. Stopping batch.`);
          break;
        }
      }
    }
  }

  // ── Stop progress bar before summary ──────────────────────────────
  progressBar.stop();

  // ── Write logs ─────────────────────────────────────────────────────
  logger.writeErrorLog('./error_log.txt');
  fieldValidator.writeLog('./missing_fields_log.json');

  // ── Print Summary ─────────────────────────────────────────────────
  logger.printSummary(fieldValidator);

  // ── Cleanup ────────────────────────────────────────────────────────
  await browser.close();
  console.log('🏁 Browser closed. Done.');
}

// ─── Entry Point ────────────────────────────────────────────────────────────

runBatch().catch(err => {
  console.error(`\n💥 Fatal error: ${err.message}`);
  process.exit(1);
});