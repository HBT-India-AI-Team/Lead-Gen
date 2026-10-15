import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1200);
console.log('URL before tab click:', page.url());

await page.getByText('Closing within 14 days', { exact: true }).first().click();
await page.waitForTimeout(2000);
console.log('URL after tab click:', page.url());

// count tender rows
const rows = await page.locator('a').evaluateAll(as => as.filter(a => a.textContent.trim().startsWith('[')).length);
console.log('Tender rows on this tab:', rows);

// look for pagination controls (Next / page numbers)
const pageControls = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a,button,input[type="submit"],input[type="button"]'));
  return all.filter(el => /next|previous|^[0-9]{1,3}$/i.test((el.textContent||el.value||'').trim()))
    .map(el => ({ tag: el.tagName, text: (el.textContent||el.value||'').trim(), href: el.href||null }));
});
console.log('Pagination controls:', JSON.stringify(pageControls, null, 2));

// total results count text if shown
const bodyText = await page.locator('body').innerText();
const idx = bodyText.search(/\d+\s*-\s*\d+\s*of\s*\d+|Total\s*Records|Records\s*Found/i);
console.log('Total-records hint:', idx >= 0 ? bodyText.slice(idx, idx+80) : 'not found');
process.exit(0);
