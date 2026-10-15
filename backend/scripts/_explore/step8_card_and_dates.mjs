import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function getCardsInfo(url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    // find leaf nodes containing "Contract date" text, walk up to find repeating card ancestor
    const leafs = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && (el.textContent || '').trim() === 'Contract date'
    );
    const cards = leafs.map(leaf => {
      // walk up until we find an ancestor with a sibling of the same class (repeating card pattern)
      let node = leaf;
      for (let i = 0; i < 8 && node.parentElement; i++) {
        node = node.parentElement;
        const parent = node.parentElement;
        if (parent && parent.children.length > 3) {
          // heuristic: this level might be the card row; check text length is substantial
          if (node.textContent.length > 200) break;
        }
      }
      return node.textContent.replace(/\s+/g, ' ').trim().slice(0, 400);
    });
    return cards;
  });
}

console.log('=== Page 0 (page=0) ===');
const p0 = await getCardsInfo('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=0');
p0.slice(0, 3).forEach((c, i) => console.log(i, ':', c));
console.log('Total cards found on page 0:', p0.length);

console.log('\n=== Page 1 (page=1) ===');
const p1 = await getCardsInfo('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=1');
p1.slice(0, 3).forEach((c, i) => console.log(i, ':', c));
console.log('Total cards found on page 1:', p1.length);

console.log('\n=== Page 4 (page=4) far page, checking dates keep descending ===');
const p4 = await getCardsInfo('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=4');
p4.slice(0, 3).forEach((c, i) => console.log(i, ':', c));
console.log('Total cards found on page 4:', p4.length);

await browser.close();
