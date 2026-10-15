import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
await p.addInitScript(() => { window.BACKEND_URL = 'http://localhost:5000'; });
await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
const html = await p.content();
console.log('has input[type=email]:', html.includes('type="email"'));
const inputs = await p.locator('input').count();
console.log('input count on page:', inputs);
for (let i = 0; i < inputs; i++) {
  const type = await p.locator('input').nth(i).getAttribute('type');
  console.log('input', i, 'type=', type);
}
await b.close();
