import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=2', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

const records = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('[data-slot="card"]'));
  return cards.map(card => {
    const title = card.querySelector('h3')?.textContent?.trim() || '';
    const descriptionEl = card.querySelector('p[title]');
    const description = descriptionEl?.getAttribute('title')?.trim() || '';

    const tagsContainer = descriptionEl?.nextElementSibling;
    const tagEls = tagsContainer ? Array.from(tagsContainer.children) : [];
    const locationEl = tagEls.find(el => el.querySelector('svg.lucide-map-pin')) || tagEls[0];
    const categoryEl = tagEls.find(el => el !== locationEl) || tagEls[1];
    const location = locationEl?.textContent?.trim() || '';
    const category = categoryEl?.textContent?.trim() || '';

    let amount = '';
    let contractDate = '';
    const spans = Array.from(card.querySelectorAll('span'));
    for (const span of spans) {
      const label = span.textContent.trim();
      const value = span.nextElementSibling?.textContent?.trim() || '';
      if (/^amount$/i.test(label)) amount = value;
      if (/^contract date$/i.test(label)) contractDate = value;
    }

    return { title, description, location, category, amount, contractDate };
  });
});

console.log(JSON.stringify(records, null, 2));
process.exit(0);
