import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=0', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

const html = await page.evaluate(() => {
  const card = document.querySelector('[data-slot="card"]');
  return card ? card.outerHTML : 'NOT FOUND';
});
console.log(html);
console.log('\n\nTotal cards with [data-slot="card"] on page:', await page.evaluate(() => document.querySelectorAll('[data-slot="card"]').length));
process.exit(0);
