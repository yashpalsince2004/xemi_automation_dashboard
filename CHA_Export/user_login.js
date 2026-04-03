/**
 * ============================================================================
 *  user_login.js — Persistent Session Management
 * ============================================================================
 *
 *  Features:
 *   - Saves session cookies to .session_cookies.json after first login
 *   - Restores session from cookies on subsequent runs (avoids re-login)
 *   - Validates session by navigating to a protected page
 *   - Auto re-login if session is expired, without breaking the flow
 *   - Exposes ensureSession() for mid-batch session health checks
 *
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const SESSION_FILE = path.join(process.cwd(), '.session_cookies.json');
const MAX_LOGIN_RETRIES = 3;

// ─── Internal: Perform Fresh Login ──────────────────────────────────────────

/**
 * Perform a fresh login using email/password from env vars.
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
async function performLogin(page) {
  await page.goto(`${process.env.BASE_URL}/auth/login`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await page.fill('#email', process.env.Email1);
  await page.fill('#password', process.env.Password1);

  await Promise.all([
    page.waitForNavigation({ timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

// ─── Internal: Save Session Cookies ─────────────────────────────────────────

/**
 * Save browser context cookies to disk for reuse.
 * @param {import('playwright').BrowserContext} context
 */
async function saveSession(context) {
  try {
    const cookies = await context.cookies();
    const storageState = await context.storageState();

    fs.writeFileSync(SESSION_FILE, JSON.stringify({
      cookies,
      storageState,
      savedAt: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.log(`    ⚠️ Could not save session: ${err.message}`);
  }
}

// ─── Internal: Load Session Cookies ─────────────────────────────────────────

/**
 * Load previously saved session data from disk.
 * @returns {object|null} Session data or null if not available
 */
function loadSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;

    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));

    // Reject sessions older than 12 hours
    if (data.savedAt) {
      const age = Date.now() - new Date(data.savedAt).getTime();
      const maxAge = 12 * 60 * 60 * 1000; // 12 hours
      if (age > maxAge) {
        console.log('    ⏰ Saved session is too old (>12h). Will login fresh.');
        return null;
      }
    }

    return data;
  } catch {
    return null;
  }
}

// ─── Internal: Validate Session ─────────────────────────────────────────────

/**
 * Check if the current session is still valid by navigating to a protected page.
 * If the page redirects to login, the session is expired.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} true if session is valid
 */
async function isSessionValid(page) {
  try {
    await page.goto(`${process.env.BASE_URL}/export-ccm`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    const url = page.url();
    // If we got redirected to login, session is invalid
    return !url.includes('/auth/login') && !url.includes('/login');
  } catch {
    return false;
  }
}

// ─── Public: Login (with session persistence) ───────────────────────────────

/**
 * Launch browser and establish authenticated session.
 * Attempts to restore from saved cookies first; falls back to fresh login.
 *
 * @param {object} opts
 * @param {boolean} opts.headless — Run headless (default: false)
 * @returns {Promise<{browser, context, page, method: 'restored'|'fresh'}>}
 */
export const login = async ({ headless = false } = {}) => {
  const browser = await chromium.launch({
    headless,
    channel: 'chrome',
  });

  // ── Try restoring session from cookies ─────────────────────────────
  const savedSession = loadSession();

  if (savedSession && savedSession.storageState) {
    try {
      const context = await browser.newContext({
        storageState: savedSession.storageState,
      });
      const page = await context.newPage();

      // Validate the restored session
      const valid = await isSessionValid(page);

      if (valid) {
        console.log('✅ Session restored from cookies');
        return { browser, context, page, method: 'restored' };
      } else {
        console.log('⚠️ Saved session expired. Logging in fresh...');
        await context.close();
      }
    } catch (err) {
      console.log(`⚠️ Failed to restore session: ${err.message}. Logging in fresh...`);
    }
  }

  // ── Fresh login with retry ──────────────────────────────────────────
  let lastError;
  for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      await performLogin(page);

      // Save session for future runs
      await saveSession(context);
      console.log('✅ Logged in (fresh)');

      return { browser, context, page, method: 'fresh' };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_LOGIN_RETRIES) {
        const wait = 2000 * attempt;
        console.log(`⚠️ Login attempt ${attempt}/${MAX_LOGIN_RETRIES} failed: ${err.message}. Retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }

  throw new Error(`Login failed after ${MAX_LOGIN_RETRIES} attempts: ${lastError.message}`);
};

// ─── Public: Ensure Session (mid-batch health check) ────────────────────────

/**
 * Verify the current session is still valid. If expired, perform a fresh
 * re-login on the same browser instance without interrupting the batch.
 *
 * Call this between file processing iterations to catch expired sessions.
 *
 * @param {import('playwright').Browser} browser
 * @param {import('playwright').Page} page
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<{page, context, reloginOccurred: boolean}>}
 */
export const ensureSession = async (browser, page, context) => {
  const valid = await isSessionValid(page);

  if (valid) {
    return { page, context, reloginOccurred: false };
  }

  // Session expired — re-login
  console.log('🔄 Session expired mid-batch. Re-authenticating...');

  try {
    await context.close();
  } catch {
    // Context may already be closed
  }

  const newContext = await browser.newContext();
  const newPage = await newContext.newPage();

  await performLogin(newPage);
  await saveSession(newContext);

  console.log('✅ Re-login successful. Continuing batch...');

  return { page: newPage, context: newContext, reloginOccurred: true };
};