import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// Check "Search By" dropdown options
const searchByOptions = await page.locator('select').first().locator('option').evaluateAll(os => os.map(o => o.textContent.trim()));
console.log('Search By dropdown options:', searchByOptions);

const tab = page.getByText('Closing by Date', { exact: true });
await tab.first().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: '_explore/06_closingbydate.png', fullPage: false });

const bodyText = await page.locator('body').innerText();
console.log('\n--- body text near "Closing by Date" section ---');
const idx = bodyText.indexOf('Closing by Date');
console.log(bodyText.slice(idx, idx + 800));

// check for date input fields
const inputs = await page.locator('input').evaluateAll(is => is.map(i => ({ type: i.type, name: i.name, id: i.id, value: i.value })));
console.log('\n--- input fields ---');
console.log(JSON.stringify(inputs, null, 2));
process.exit(0);
