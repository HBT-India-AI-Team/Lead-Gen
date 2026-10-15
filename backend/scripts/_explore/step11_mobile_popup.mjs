import { chromium, devices } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

await page.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=0', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: '_explore/11_mobile.png', fullPage: false });

const bodyHtml = await page.content();
console.log('mobile: contains "mobile number"?', /mobile number/i.test(bodyHtml));
console.log('mobile: contains input type=tel?', /type=["']tel["']/i.test(bodyHtml));

const dialogs = await page.locator('[role="dialog"], .modal, [class*="modal" i], [class*="popup" i], [class*="overlay" i]').all();
for (const d of dialogs) {
  if (await d.isVisible().catch(()=>false)) {
    console.log('VISIBLE:', (await d.getAttribute('class'))||'', (await d.innerText().catch(()=>'')).slice(0,200));
  }
}
await context.close();

// Separately: get full card ancestor structure for selector design (desktop)
const browser2 = await chromium.launch({ headless: true });
const page2 = await browser2.newPage();
await page2.goto('https://www.tenderbook.in/tender-results/all-tenders/construction-categories/active?page=0', { waitUntil: 'networkidle', timeout: 30000 });
await page2.waitForTimeout(2000);

const structure = await page2.evaluate(() => {
  const amountLabel = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent.trim() === 'Amount');
  let node = amountLabel;
  const chain = [];
  for (let i = 0; i < 10 && node; i++) {
    chain.push({ tag: node.tagName, cls: (node.className||'').toString().slice(0,80), childCount: node.children.length, textLen: node.textContent.length });
    node = node.parentElement;
  }
  return chain;
});
console.log('Ancestor chain from "Amount" label upward:', JSON.stringify(structure, null, 2));

// find repeated siblings at the level where childCount jumps (i.e., the list container)
const listInfo = await page2.evaluate(() => {
  const amountLabel = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent.trim() === 'Amount');
  let node = amountLabel;
  for (let i = 0; i < 10 && node; i++) {
    const parent = node.parentElement;
    if (parent && parent.children.length >= 8 && parent.children.length <= 15) {
      return { level: i, parentChildren: parent.children.length, cardClass: node.className, cardTag: node.tagName, cardOuterHTMLSnippet: node.outerHTML.slice(0, 1500) };
    }
    node = parent;
  }
  return null;
});
console.log('\nLikely list container info:', JSON.stringify(listInfo, null, 2));

await browser2.close();
