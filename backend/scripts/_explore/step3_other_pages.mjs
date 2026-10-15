import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const pagesToCheck = [
  ['Active Tenders', 'https://eprocure.gov.in/eprocure/app?page=FrontEndLatestActiveTenders&service=page'],
  ['Tenders by Closing Date', 'https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page'],
  ['Tenders by Location', 'https://eprocure.gov.in/eprocure/app?page=FrontEndTendersByLocation&service=page'],
  ['Tenders by Organisation', 'https://eprocure.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page'],
];

for (const [label, url] of pagesToCheck) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  const hasCaptcha = await page.locator('text=/captcha/i').count();
  const bodyText = await page.locator('body').innerText();
  console.log(`${label}: captcha mentions=${hasCaptcha}`);
  await page.screenshot({ path: `_explore/03_${label.replace(/\s+/g,'_')}.png`, fullPage: false });
}
process.exit(0);
