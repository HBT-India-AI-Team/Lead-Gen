import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('Navigating to Construction category...');
await page.goto('https://www.tenderbook.in/all-tenders/construction-categories/active', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

await page.screenshot({ path: '_explore/02_category.png', fullPage: false });
console.log('Screenshot saved. URL:', page.url());

// Look for dialogs/modals/popups broadly
const selectors = ['[role="dialog"]', '.modal', '.popup', '[class*="modal"]', '[class*="popup"]', '[class*="Modal"]', '[class*="Popup"]', '[class*="overlay"]'];
for (const sel of selectors) {
  const els = await page.locator(sel).all();
  for (const el of els) {
    const visible = await el.isVisible().catch(() => false);
    if (visible) {
      const cls = await el.getAttribute('class').catch(() => null);
      const text = await el.innerText().catch(() => '');
      console.log(`POPUP CANDIDATE sel=${sel} class=${cls} text="${text.slice(0,150)}"`);
    }
  }
}

// Also check for any element containing "mobile" or phone-number sign-in wording
const bodyHtml = await page.content();
console.log('Body HTML length:', bodyHtml.length);
console.log('Contains "mobile number"?', /mobile number/i.test(bodyHtml));
console.log('Contains "sign in"?', /sign.?in/i.test(bodyHtml));
console.log('Contains "OTP"?', /OTP/i.test(bodyHtml));

await browser.close();
