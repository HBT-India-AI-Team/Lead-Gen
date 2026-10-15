import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('Navigating to eprocure.gov.in/eprocure/app...');
const resp = await page.goto('https://eprocure.gov.in/eprocure/app', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => { console.log('goto error:', e.message); return null; });
console.log('Response status:', resp ? resp.status() : 'N/A');
console.log('Final URL:', page.url());
await page.waitForTimeout(1500);
await page.screenshot({ path: '_explore/01_home.png', fullPage: false });
console.log('Title:', await page.title());

const links = await page.locator('a').evaluateAll(as => as.map(a => ({ text: a.textContent.trim(), href: a.href })).filter(l => l.text));
const seen = new Set();
console.log('--- links containing "classif" or "tender" (case-insens) ---');
for (const l of links) {
  if (seen.has(l.href)) continue;
  if (/classif|tender/i.test(l.text) || /classif|tender/i.test(l.href)) {
    seen.add(l.href);
    console.log(l.text, '->', l.href);
  }
}
process.exit(0);
