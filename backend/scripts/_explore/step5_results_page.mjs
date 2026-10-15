import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

await page.screenshot({ path: '_explore/05_results_construction.png', fullPage: false });
console.log('URL:', page.url());

// Check for popup
const bodyHtml = await page.content();
console.log('Contains "mobile"?', /mobile/i.test(bodyHtml));
console.log('Contains "OTP"?', /OTP/i.test(bodyHtml));
const visibleDialogs = await page.locator('[role="dialog"], .modal, [class*="modal" i], [class*="popup" i]').all();
for (const d of visibleDialogs) {
  if (await d.isVisible().catch(()=>false)) console.log('VISIBLE DIALOG:', (await d.getAttribute('class'))||'', (await d.innerText().catch(()=> '')).slice(0,200));
}

// dump pagination area html
const paginationHtml = await page.locator('body').evaluate(() => {
  const candidates = Array.from(document.querySelectorAll('*')).filter(el => /pagination|pager/i.test(el.className || ''));
  return candidates.map(c => c.outerHTML.slice(0, 500)).join('\n---\n');
});
console.log('--- Pagination candidates ---');
console.log(paginationHtml.slice(0, 2000) || '(none found by class name)');

await browser.close();
