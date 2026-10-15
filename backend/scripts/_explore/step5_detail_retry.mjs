import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

const tab = page.getByText('Closing within 14 days', { exact: true });
if (await tab.count()) {
  await tab.first().click();
  await page.waitForTimeout(2000);
}

// Find links whose text starts with "[" (tender title bracket pattern seen in screenshot)
const candidates = await page.locator('a').evaluateAll(as =>
  as.map(a => ({ text: a.textContent.trim(), href: a.href }))
    .filter(l => l.text.startsWith('['))
);
console.log('Tender-like links found:', candidates.length);
candidates.slice(0, 3).forEach((c, i) => console.log(i, c.text.slice(0,80), '->', c.href));

if (candidates.length === 0) { console.log('No bracketed links found, dumping all link texts for inspection'); 
  const all = await page.locator('a').evaluateAll(as => as.map(a => a.textContent.trim()).filter(Boolean));
  console.log(all.slice(0, 40));
  process.exit(0);
}

const target = candidates[0];
await page.goto(target.href, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
console.log('\nDetail page URL:', page.url());
await page.screenshot({ path: '_explore/05_detail.png', fullPage: true });
const hasCaptcha = await page.locator('text=/captcha/i').count();
console.log('Captcha mentions on detail page:', hasCaptcha);
const bodyText = await page.locator('body').innerText();
console.log('body text length:', bodyText.length);
console.log(bodyText.slice(0, 4000));
process.exit(0);
