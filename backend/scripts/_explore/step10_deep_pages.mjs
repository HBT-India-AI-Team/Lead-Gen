import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

for (const p of [50, 150, 500, 1500]) {
  const url = `https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=${p}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  const dates = await page.evaluate(() => {
    const text = document.body.innerText;
    const matches = [...text.matchAll(/Contract date\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/g)];
    return matches.map(m => m[1]);
  });
  const totalText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length===0 && /^All\s*\(/.test((e.textContent||'').trim()));
    return el ? el.textContent.trim() : null;
  });
  console.log(`page=${p}: total="${totalText}" dates=[${dates.join(', ')}]`);
}

await browser.close();
