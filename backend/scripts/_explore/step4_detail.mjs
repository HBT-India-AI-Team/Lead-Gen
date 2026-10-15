import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// click the "Closing within 14 days" tab for more results, then click first tender title link
const tab = page.getByText('Closing within 14 days', { exact: true });
if (await tab.count()) {
  await tab.first().click();
  await page.waitForTimeout(2000);
}

const firstLink = page.locator('table a').first();
const linkHref = await firstLink.getAttribute('href').catch(() => null);
const linkText = await firstLink.textContent().catch(() => null);
console.log('First tender link text:', (linkText||'').slice(0,100));
console.log('First tender link href:', linkHref);

await firstLink.click();
await page.waitForTimeout(2500);
console.log('Detail page URL:', page.url());
await page.screenshot({ path: '_explore/04_detail.png', fullPage: true });

const hasCaptcha = await page.locator('text=/captcha/i').count();
console.log('Captcha mentions on detail page:', hasCaptcha);

const bodyText = await page.locator('body').innerText();
console.log('--- body text length ---', bodyText.length);
console.log(bodyText.slice(0, 3000));
process.exit(0);
