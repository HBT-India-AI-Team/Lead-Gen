import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
const bodyText = await page.locator('body').innerText();
const idx = bodyText.search(/refresh|updated every|minutes?/i);
console.log('Refresh/update mention on homepage:', idx >= 0 ? bodyText.slice(Math.max(0,idx-100), idx+150) : 'NOT FOUND');

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1200);
const bt2 = await page.locator('body').innerText();
const idx2 = bt2.search(/refresh|updated every|minutes?/i);
console.log('Refresh/update mention on Closing-by-Date page:', idx2 >= 0 ? bt2.slice(Math.max(0,idx2-100), idx2+150) : 'NOT FOUND');
process.exit(0);
