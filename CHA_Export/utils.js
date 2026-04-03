/**
 * ============================================================================
 *  utils.js — Shared Utilities for CHA Export Automation
 * ============================================================================
 *
 *  Provides reusable helpers for:
 *   - retry()           — Retry transient failures with exponential backoff
 *   - safeClick()       — Click with visibility wait + retry
 *   - safeFill()        — Fill with visibility wait + retry
 *   - smartWait()       — Wait for network idle + DOM stable (no hardcoded delays)
 *   - handleSweetAlert()— Dismiss SweetAlert popups gracefully
 *   - FieldValidator    — Validate & log missing fields per file
 *   - BatchLogger       — Centralized structured logging
 *
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

// ─── Retry with Exponential Backoff ─────────────────────────────────────────

/**
 * Retry an async function up to `maxRetries` times with exponential backoff.
 *
 * @param {Function} fn          — Async function to execute
 * @param {object}   opts
 * @param {number}   opts.retries   — Max retry count (default: 3)
 * @param {number}   opts.delayMs   — Initial delay between retries (default: 1000)
 * @param {string}   opts.label     — Label for log messages
 * @param {Function} opts.onRetry   — Optional callback(attempt, error)
 * @returns {Promise<*>} — Result of fn()
 */
export async function retry(fn, {
  retries = 3,
  delayMs = 1000,
  label = 'operation',
  onRetry = null,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt <= retries) {
        const wait = delayMs * Math.pow(2, attempt - 1); // exponential backoff
        if (onRetry) onRetry(attempt, err);
        console.log(`    🔄 Retry ${attempt}/${retries} for "${label}" in ${wait}ms — ${err.message}`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

// ─── Smart Click / Fill with Retry ──────────────────────────────────────────

/**
 * Click a locator with visibility wait and retry on failure.
 * @param {import('playwright').Locator} locator
 * @param {object} opts
 * @param {number} opts.timeout  — Visibility wait timeout (default: 10000)
 * @param {number} opts.retries  — Retry count (default: 2)
 */
export async function safeClick(locator, { timeout = 10000, retries = 2 } = {}) {
  await retry(async () => {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click();
  }, { retries, label: 'safeClick', delayMs: 500 });
}

/**
 * Fill a locator with visibility wait and retry on failure.
 * @param {import('playwright').Locator} locator
 * @param {string} value
 * @param {object} opts
 * @param {number} opts.timeout  — Visibility wait timeout (default: 10000)
 * @param {number} opts.retries  — Retry count (default: 2)
 */
export async function safeFill(locator, value, { timeout = 10000, retries = 2 } = {}) {
  await retry(async () => {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.fill(value || '');
  }, { retries, label: 'safeFill', delayMs: 500 });
}

// ─── Smart Wait (replaces hardcoded waitForTimeout) ─────────────────────────

/**
 * Wait for the page to become idle — no in-flight network requests and
 * no pending Angular/NZ spin loaders on screen.
 *
 * Falls back to a fixed delay if smart detection times out.
 *
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {number} opts.timeout    — Max time to wait in ms (default: 10000)
 * @param {number} opts.fallbackMs — Fallback delay if detection fails (default: 2000)
 */
export async function smartWait(page, { timeout = 10000, fallbackMs = 2000 } = {}) {
  try {
    // Wait for nz-spin loaders to disappear (common in Xemi Angular UI)
    const spinner = page.locator('nz-spin .ant-spin-spinning, .ant-spin-spinning');
    await spinner.waitFor({ state: 'hidden', timeout }).catch(() => {});

    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  } catch {
    // Fallback: hard wait
    await page.waitForTimeout(fallbackMs);
  }
}

// ─── SweetAlert Handler ─────────────────────────────────────────────────────

/**
 * Handle optional SweetAlert popups that may appear after navigation.
 * Automatically detects and confirms them.
 *
 * @param {import('playwright').Page} page
 * @param {string} label   — Description for logging
 * @param {number} timeout — Max wait time in ms (default: 3000)
 * @returns {Promise<boolean>} — true if popup was handled
 */
export async function handleSweetAlert(page, label = 'Popup', timeout = 3000, action = 'confirm') {
  try {
    const swalPopup = page.locator('.swal2-popup');
    await swalPopup.waitFor({ state: 'visible', timeout });

    const swalTitle = await swalPopup.locator('.swal2-title').textContent();

    // Backwards compatibility for boolean
    if (action === true) action = 'confirm';
    if (action === false) action = 'deny';

    console.log(`    🔔 ${label}: ${swalTitle} (Action: ${action})`);

    if (action === 'confirm') {
      await swalPopup.locator('.swal2-confirm').click();
    } else if (action === 'deny') {
      await swalPopup.locator('.swal2-deny').click();
    } else if (action === 'cancel') {
      await swalPopup.locator('.swal2-cancel').click();
    }

    await page.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

// ─── Field Validator ────────────────────────────────────────────────────────

/**
 * Validates input data rows and tracks missing/invalid fields.
 *
 * Usage:
 *   const validator = new FieldValidator();
 *   validator.check(fileName, row, 'Exporter Name', ['Exporter Name', 'Exporter', 'Exporter_Name']);
 *   // At the end:
 *   validator.writeLog('./missing_fields_log.json');
 */
export class FieldValidator {
  constructor() {
    /** @type {Array<{file: string, field: string, timestamp: string, message: string}>} */
    this.missingFields = [];
  }

  /**
   * Check if a required field exists in a data row (trying multiple aliases).
   *
   * @param {string} fileName   — Source file name
   * @param {object} row        — Data row object
   * @param {string} fieldLabel — Human-readable field name for logging
   * @param {string[]} aliases  — List of possible key names in the row
   * @returns {*} — The field value, or null if missing
   */
  check(fileName, row, fieldLabel, aliases) {
    for (const key of aliases) {
      const val = row[key];
      if (val !== undefined && val !== null && val !== '') {
        return val;
      }
    }

    // Field is missing — log it
    this.missingFields.push({
      file: fileName,
      field: fieldLabel,
      tried: aliases,
      timestamp: new Date().toISOString(),
      message: `Field "${fieldLabel}" not found (tried: ${aliases.join(', ')})`,
    });

    return null;
  }

  /** @returns {number} Total missing field count */
  get count() {
    return this.missingFields.length;
  }

  /**
   * Get missing fields for a specific file.
   * @param {string} fileName
   * @returns {Array}
   */
  getForFile(fileName) {
    return this.missingFields.filter(f => f.file === fileName);
  }

  /** @returns {string[]} List of unique files with missing fields */
  get filesAffected() {
    return [...new Set(this.missingFields.map(f => f.file))];
  }

  /**
   * Write the missing fields log to disk.
   * @param {string} outputPath — File path (default: ./missing_fields_log.json)
   */
  writeLog(outputPath = './missing_fields_log.json') {
    if (this.missingFields.length === 0) return;

    const report = {
      generatedAt: new Date().toISOString(),
      totalMissing: this.missingFields.length,
      filesAffected: this.filesAffected.length,
      entries: this.missingFields,
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📄 Missing fields log written to: ${path.resolve(outputPath)}`);
  }
}

// ─── Batch Logger ───────────────────────────────────────────────────────────

/**
 * Centralized logger that collects structured per-file results
 * and produces a comprehensive summary at the end.
 */
export class BatchLogger {
  constructor() {
    /** @type {Array<{file: string, status: string, error?: string, missingFields?: number, duration?: number}>} */
    this.results = [];
    this.startTime = Date.now();
    this.loginStatus = 'pending';
    this.reloginCount = 0;
  }

  /** Log a successful login */
  logLogin(method = 'fresh') {
    this.loginStatus = 'success';
    console.log(`🔐 Login: ${method === 'restored' ? 'Session restored from cookies' : 'Fresh login completed'}`);
  }

  /** Log a re-login event */
  logRelogin() {
    this.reloginCount++;
    console.log(`🔄 Re-login #${this.reloginCount}: Session expired, re-authenticating...`);
  }

  /** Log a login failure */
  logLoginFailed(error) {
    this.loginStatus = 'failed';
    console.error(`❌ Login failed: ${error}`);
  }

  /**
   * Record the result for a single file.
   * @param {string} file
   * @param {'success'|'failed'} status
   * @param {object} details
   */
  addResult(file, status, details = {}) {
    this.results.push({ file, status, ...details });
  }

  /**
   * Write the error log file (only files that failed).
   * @param {string} outputPath
   */
  writeErrorLog(outputPath = './error_log.txt') {
    const errors = this.results.filter(r => r.status === 'failed');
    if (errors.length === 0) return;

    const timestamp = new Date().toISOString();
    const logContent = [
      `Error Log — ${timestamp}`,
      '─'.repeat(50),
      '',
      ...errors.map((e, i) =>
        `${i + 1}. [${e.file}]\n   Error: ${e.error}\n`
      ),
    ].join('\n');

    fs.writeFileSync(outputPath, logContent, 'utf-8');
    console.log(`📄 Error log written to: ${path.resolve(outputPath)}`);
  }

  /**
   * Format and print the final batch summary to console.
   * @param {FieldValidator} fieldValidator — Optional validator for missing field stats
   */
  printSummary(fieldValidator = null) {
    const elapsed = Date.now() - this.startTime;
    const hrs = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const duration = hrs > 0
      ? `${hrs}h ${mins}m ${secs}s`
      : mins > 0
        ? `${mins}m ${secs}s`
        : `${secs}s`;

    const successCount = this.results.filter(r => r.status === 'success').length;
    const failCount = this.results.filter(r => r.status === 'failed').length;
    const errors = this.results.filter(r => r.status === 'failed');

    let summary = `
${'═'.repeat(55)}
 📊  BATCH PROCESSING SUMMARY
${'═'.repeat(55)}
  🔐 Login:               ${this.loginStatus}${this.reloginCount > 0 ? ` (re-logins: ${this.reloginCount})` : ''}
  📁 Total files:          ${this.results.length}
  ✅ Succeeded:            ${successCount}
  ❌ Failed:               ${failCount}
  ⏱  Duration:             ${duration}`;

    if (fieldValidator && fieldValidator.count > 0) {
      summary += `
  ⚠️  Missing fields:       ${fieldValidator.count} across ${fieldValidator.filesAffected.length} file(s)
  📄 Missing fields log:   ${path.resolve('./missing_fields_log.json')}`;
    }

    if (errors.length > 0) {
      summary += `
  📄 Error log:            ${path.resolve('./error_log.txt')}`;
    }

    summary += `
${'═'.repeat(55)}`;

    console.log(summary);
  }
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

/**
 * Persistent terminal progress bar pinned to the bottom of the screen.
 *
 * Shows:
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ ████████████░░░░░░░░  12/500 (2%)  ✅ 10  ❌ 2  ⏳ 488  ⏱ 4m   │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   const bar = new ProgressBar(totalFiles);
 *   bar.start();
 *   // after each file:
 *   bar.tick('success');  // or bar.tick('failed');
 *   // at the end:
 *   bar.stop();
 */
export class ProgressBar {
  /**
   * @param {number} total — Total number of files to process
   * @param {number} barWidth — Character width of the visual bar (default: 30)
   */
  constructor(total, barWidth = 30) {
    this.total = total;
    this.barWidth = barWidth;
    this.completed = 0;
    this.succeeded = 0;
    this.failed = 0;
    this.startTime = Date.now();
    this._interval = null;
    this._active = false;

    // Intercept console.log / console.error so output prints ABOVE the bar
    this._origLog = console.log.bind(console);
    this._origError = console.error.bind(console);
  }

  /** Start rendering the progress bar (auto-refreshes every 500ms for timer) */
  start() {
    this._active = true;

    // Override console.log and console.error to clear bar → print → re-draw bar
    console.log = (...args) => {
      this._clearBar();
      this._origLog(...args);
      this._renderBar();
    };
    console.error = (...args) => {
      this._clearBar();
      this._origError(...args);
      this._renderBar();
    };

    // Auto-refresh every second to keep the elapsed timer ticking
    this._interval = setInterval(() => this._renderBar(), 1000);

    this._renderBar();
  }

  /**
   * Mark one file as completed.
   * @param {'success'|'failed'} status
   */
  tick(status = 'success') {
    this.completed++;
    if (status === 'success') this.succeeded++;
    else this.failed++;
    this._renderBar();
  }

  /** Stop the progress bar — restore console, clear interval, final render */
  stop() {
    this._active = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    // Restore original console methods
    console.log = this._origLog;
    console.error = this._origError;

    // Clear the bar line and move cursor back up
    this._clearBar();
  }

  /** @private Clear the bar line */
  _clearBar() {
    if (!this._active) return;
    process.stdout.write('\x1B[s');       // save cursor
    process.stdout.write('\x1B[999;1H');  // move to last row
    process.stdout.write('\x1B[2K');      // clear the line
    process.stdout.write('\x1B[u');       // restore cursor
  }

  /** @private Render the bar at the bottom of the terminal */
  _renderBar() {
    if (!this._active) return;

    const pct = this.total > 0 ? Math.round((this.completed / this.total) * 100) : 0;
    const filled = Math.round((this.completed / this.total) * this.barWidth);
    const empty = this.barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const remaining = this.total - this.completed;

    // Elapsed time
    const elapsed = Date.now() - this.startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    // ETA
    let etaStr = '--';
    if (this.completed > 0) {
      const avgMs = elapsed / this.completed;
      const etaMs = avgMs * remaining;
      const etaMins = Math.floor(etaMs / 60000);
      const etaSecs = Math.floor((etaMs % 60000) / 1000);
      etaStr = etaMins > 0 ? `${etaMins}m ${etaSecs}s` : `${etaSecs}s`;
    }

    const line = ` ${bar}  ${this.completed}/${this.total} (${pct}%)  ✅ ${this.succeeded}  ❌ ${this.failed}  ⏳ ${remaining} remaining  ⏱ ${timeStr}  ETA: ${etaStr}`;

    process.stdout.write('\x1B[s');       // save cursor position
    process.stdout.write('\x1B[999;1H');  // jump to last row, col 1
    process.stdout.write('\x1B[2K');      // clear line
    process.stdout.write(`\x1B[36m${line}\x1B[0m`); // cyan color
    process.stdout.write('\x1B[u');       // restore cursor position
  }
}
