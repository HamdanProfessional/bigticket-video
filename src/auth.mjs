// Signing in, so the recorder can film the app behind the login rather than
// only the marketing page.
//
// Credentials are read from the environment and never written anywhere: not to
// the storyboard, the manifest, a log line, or this file. The saved session
// (cookies + local storage) is a credential too, so its default location is
// outside the repo and the in-repo path is gitignored.

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const SESSION_PATH = process.env.BT_SESSION || path.join('.auth', 'session.json');

/** Credentials from the environment, or null if unset. */
export function credentialsFromEnv() {
  const email = process.env.BT_EMAIL;
  const password = process.env.BT_PASSWORD;
  return email && password ? { email, password } : null;
}

/**
 * Drives the site's login modal.
 *
 * The flow, as measured: "Log in" opens a modal offering email / Google /
 * Facebook; "Sign in with email" swaps in the credential fields; submitting
 * lands on /dashboard. The modal's email input is `type=text name=email`,
 * which is what distinguishes it from the newsletter field in the footer —
 * that one is `type=email` and matching it instead silently fills the wrong
 * form.
 */
export async function login(page, { email, password }, { origin = 'https://shopbigticket.com' } = {}) {
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  await page.getByRole('button', { name: /^log ?in$/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /sign in with email/i }).click();
  await page.waitForTimeout(2000);

  await page.locator('input[name="email"][type="text"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  // Enter submits the modal; the visible "Log in" buttons are ambiguous (the
  // header has one too) and the newsletter "Submit" is a decoy.
  await page.locator('input[name="password"]').first().press('Enter');

  await page.waitForURL(/\/dashboard/, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const ok = /\/dashboard/.test(page.url());
  if (!ok) {
    // Deliberately does not echo the email — error text ends up in logs.
    throw new Error(
      `Login did not reach /dashboard (still at ${page.url()}). ` +
      'The account may need a different flow, or the site may be challenging automation.'
    );
  }
  return true;
}

/**
 * Signs in once and caches the session, so repeated renders skip the login.
 * Returns a storageState path usable by `browser.newContext`.
 */
export async function ensureSession(browser, creds, { origin, sessionPath = SESSION_PATH, fresh = false } = {}) {
  if (fresh && existsSync(sessionPath)) await rm(sessionPath, { force: true });
  if (!fresh && existsSync(sessionPath)) return sessionPath;

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await login(page, creds, { origin });
    await mkdir(path.dirname(sessionPath), { recursive: true });
    await ctx.storageState({ path: sessionPath });
  } finally {
    await ctx.close();
  }
  return sessionPath;
}
