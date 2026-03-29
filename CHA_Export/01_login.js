import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

export const login = async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${process.env.BASE_URL}/auth/login`);

  await page.fill('#email', process.env.Email1);
  await page.fill('#password', process.env.Password1);

  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]')
  ]);

  console.log("✅ Logged in");

  return { browser, page };
};