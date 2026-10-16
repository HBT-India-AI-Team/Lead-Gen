import { chromium } from 'playwright-core';
import path from 'path';
const SCRATCH = 'C:/Users/HARINI~1.RAM/AppData/Local/Temp/claude/c--Users-Harini-Ramamoorthy-OneDrive---Hauhinco-Holding-GmbH-Lead-gen-agent-Lead-gen-agent-lead-gen-agent/07fc1329-d6d5-4ee7-874a-7b47f1bd34bd/scratchpad';
const outDir = path.resolve(SCRATCH, 'shots', 'login-fix');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
p.on('pageerror', e => console.log('EXCEPTION:', e.message));
await p.addInitScript(() => { window.BACKEND_URL = 'http://localhost:5000'; });

// 1. Confirm the credentials box text is gone from the page.
await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
const pageText = await p.locator('body').innerText();
console.log('Contains "Default Seeded":', pageText.includes('Default Seeded'));
console.log('Contains "Admin@123":', pageText.includes('Admin@123'));
console.log('Contains "admin@leadgen.local":', pageText.includes('admin@leadgen.local'));
await p.screenshot({ path: path.join(outDir, 'login-page.png'), fullPage: true });

// 2. Confirm the login form still works end-to-end.
await p.fill('input[type="email"]', 'admin@leadgen.local');
await p.fill('input[type="password"]', 'Admin@123');
await p.click('button[type="submit"]');
await p.waitForURL('**/dashboard', { timeout: 10000 });
console.log('Login succeeded, landed on:', p.url());
await b.close();
