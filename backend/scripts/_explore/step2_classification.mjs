import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndTendersByClassification&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '_explore/02_classification.png', fullPage: false });
console.log('URL:', page.url());
console.log('Title:', await page.title());

// look for classification tree/links
const links = await page.locator('a').evaluateAll(as => as.map(a => ({ text: a.textContent.trim(), href: a.href })).filter(l => l.text));
const seen = new Set();
let count = 0;
console.log('--- all links on page (first 80) ---');
for (const l of links) {
  if (seen.has(l.href)) continue;
  seen.add(l.href);
  if (count++ >= 80) break;
  console.log(l.text.slice(0,60), '->', l.href.slice(0,150));
}
process.exit(0);
