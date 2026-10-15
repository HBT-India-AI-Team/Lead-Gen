import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.tenderbook.in/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
await page.getByText('Tender Results', { exact: true }).first().hover();
await page.waitForTimeout(800);

const links = await page.locator('a').evaluateAll(as => as.map(a => ({ text: a.textContent.trim(), href: a.href })));
const seen = new Set();
for (const l of links) {
  if (/tender-results|Tender Results/i.test(l.text) || /tender-results/i.test(l.href)) {
    if (!seen.has(l.href)) { seen.add(l.href); console.log(l.text, '->', l.href); }
  }
}
console.log('--- View all link ---');
const viewAll = await page.getByText('View all', { exact: true }).first();
console.log(await viewAll.evaluate(el => el.closest('a')?.href || el.href || 'no href found on ancestor'));

await browser.close();
