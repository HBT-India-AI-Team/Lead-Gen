import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.tenderbook.in/all-tenders/construction-categories/active', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

console.log('Clicking Tender Results tab...');
await page.getByText('Tender Results', { exact: true }).first().click();
await page.waitForTimeout(3000);
console.log('URL after click:', page.url());

await page.screenshot({ path: '_explore/03_tenderresults.png', fullPage: false });

// dump the hrefs of the top nav "Tender Results" dropdown for category links
await page.goto('https://www.tenderbook.in/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
const trNav = page.locator('text=Tender Results').first();
await trNav.hover();
await page.waitForTimeout(800);
await page.screenshot({ path: '_explore/03b_navhover.png', fullPage: false });

await browser.close();
