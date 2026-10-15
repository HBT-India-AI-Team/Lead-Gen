import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Find repeated card containers: look for elements that contain both "Contract date" and "Amount" text
const cardHtml = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('body *'));
  const candidates = all.filter(el => {
    const t = el.textContent || '';
    return t.includes('Contract date') && t.includes('Amount') && t.length < 2000;
  });
  // pick the smallest matching element (most specific card wrapper)
  candidates.sort((a, b) => a.textContent.length - b.textContent.length);
  return candidates[0] ? candidates[0].outerHTML : 'NOT FOUND';
});
console.log('--- Smallest card-like element HTML ---');
console.log(cardHtml.slice(0, 4000));

console.log('\n--- scrolling to bottom to find pagination ---');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2000);
await page.screenshot({ path: '_explore/06_bottom.png', fullPage: false });

const bottomHtml = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label], [class*="pagination" i]');
  if (nav) return nav.outerHTML;
  // fallback: look for elements with text "Next" or page numbers
  const all = Array.from(document.querySelectorAll('a,button'));
  const pageish = all.filter(el => /^\d+$/.test((el.textContent||'').trim()) || /next|prev/i.test(el.textContent||''));
  return pageish.map(el => `<${el.tagName} class="${el.className}">${el.textContent.trim()}</${el.tagName}> href=${el.href||''}`).join('\n');
});
console.log('--- Pagination area ---');
console.log(bottomHtml.slice(0, 3000));

await browser.close();
