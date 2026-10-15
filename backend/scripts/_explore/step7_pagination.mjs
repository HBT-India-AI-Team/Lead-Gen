import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);

function countCards() {
  return document.querySelectorAll('*').length; // placeholder, replaced below
}

const initialCount = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('*')).filter(el => (el.textContent||'').includes('Contract date') && (el.textContent||'').includes('Amount') && el.children.length <= 3).length;
});
console.log('Initial small Contract-date/Amount leaf nodes:', initialCount);

// Get first card title text before scrolling
const firstTitleBefore = await page.locator('h2, h3').first().innerText().catch(()=>null);
console.log('First heading before scroll:', firstTitleBefore);

// Try scrolling the whole page multiple times
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(1200);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: '_explore/07_after_scroll.png', fullPage: false });

const afterScrollCount = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('*')).filter(el => (el.textContent||'').includes('Contract date') && (el.textContent||'').includes('Amount') && el.children.length <= 3).length;
});
console.log('After scroll count:', afterScrollCount);

// look explicitly for page number links/buttons anywhere in DOM now
const pageControls = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('a,button'));
  return all.filter(el => /^[0-9]{1,3}$/.test((el.textContent||'').trim()) || /next|prev|load more/i.test(el.textContent||''))
    .map(el => ({ tag: el.tagName, text: el.textContent.trim(), href: el.href || null, cls: el.className }));
});
console.log('Page controls found:', JSON.stringify(pageControls, null, 2));

// try query param approach
console.log('\n--- Trying ?page=2 ---');
await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=2', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
const firstTitlePage2 = await page.locator('h2, h3').first().innerText().catch(()=>null);
console.log('URL:', page.url());
console.log('First heading on ?page=2:', firstTitlePage2);

await browser.close();
