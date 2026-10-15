import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://eprocure.gov.in/eprocure/app?page=FrontEndListTendersbyDate&service=page', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1200);
await page.getByText('Closing within 14 days', { exact: true }).first().click();
await page.waitForTimeout(2000);

// Dump the outer HTML of the results table row containing the tender links
const rowHtml = await page.evaluate(() => {
  const link = Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim().startsWith('['));
  if (!link) return 'NOT FOUND';
  let row = link.closest('tr');
  return row ? row.outerHTML : 'NO TR ANCESTOR: ' + link.parentElement.outerHTML;
});
console.log('--- Row HTML ---');
console.log(rowHtml.slice(0, 2500));

// collect several detail links and visit 3 of them to see Tender Category / Tender Value variety
const links = await page.locator('a').evaluateAll(as => as.filter(a => a.textContent.trim().startsWith('[')).map(a => a.href));
console.log('\nTotal detail links on page 1:', links.length);

for (const href of links.slice(0, 4)) {
  await page.goto(href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  const bodyText = await page.locator('body').innerText();
  const cat = /Tender Category\s+(\S+)/.exec(bodyText);
  const prodCat = /Product Category\s+([^\n]+?)\s+Sub category/.exec(bodyText);
  const val = /Tender Value in ₹\s+([^\t\n]+)/.exec(bodyText);
  const loc = /Location\s+([^\t\n]+?)\s+Pincode/.exec(bodyText);
  console.log('href:', href.slice(0,90));
  console.log('  Tender Category:', cat ? cat[1] : 'N/A', '| Product Category:', prodCat ? prodCat[1].trim() : 'N/A', '| Tender Value:', val ? val[1].trim() : 'N/A', '| Location:', loc ? loc[1].trim() : 'N/A');
}
process.exit(0);
