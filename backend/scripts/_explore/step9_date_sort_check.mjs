import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

function parseDMY(d) {
  const [dd, mm, yyyy] = d.split('/').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

let allDates = [];
for (let p = 0; p <= 12; p++) {
  const url = `https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=${p}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  const dates = await page.evaluate(() => {
    const text = document.body.innerText;
    const matches = [...text.matchAll(/Contract date\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/g)];
    return matches.map(m => m[1]);
  });
  console.log(`page=${p}:`, dates.join(', '));
  allDates.push(...dates.map(parseDMY));
}

// check monotonic non-increasing
let violations = 0;
for (let i = 1; i < allDates.length; i++) {
  if (allDates[i] > allDates[i-1]) violations++;
}
console.log('\nTotal dates collected:', allDates.length, '| Out-of-order violations:', violations);

await browser.close();
