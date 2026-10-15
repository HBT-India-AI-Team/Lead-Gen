import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ userAgent: undefined });

console.log('Navigating to tenderbook.in...');
await page.goto('https://www.tenderbook.in/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: '_explore/01_homepage.png', fullPage: false });
console.log('Screenshot saved.');

// Look for any popup/modal/dialog
const bodyText = await page.locator('body').innerText();
console.log('--- Page title ---', await page.title());
console.log('--- URL after load ---', page.url());

// Find likely popup elements
const dialogs = await page.locator('[role="dialog"], .modal, .popup, [class*="modal"], [class*="popup"]').all();
console.log('Potential popup elements found:', dialogs.length);
for (let i = 0; i < dialogs.length; i++) {
  const visible = await dialogs[i].isVisible().catch(() => false);
  const cls = await dialogs[i].getAttribute('class').catch(() => null);
  console.log(`  [${i}] visible=${visible} class=${cls}`);
}

// Grab nav links to find "Tender Results" section
const links = await page.locator('a').evaluateAll(as => as.map(a => ({ text: a.textContent.trim(), href: a.href })).filter(l => l.text));
const uniqueHrefs = new Map();
for (const l of links) {
  if (!uniqueHrefs.has(l.href)) uniqueHrefs.set(l.href, l.text);
}
console.log('--- Nav/links sample (first 60) ---');
let count = 0;
for (const [href, text] of uniqueHrefs) {
  if (count++ >= 60) break;
  console.log(text, '->', href);
}

await browser.close();
