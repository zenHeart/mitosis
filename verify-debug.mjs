import { chromium } from 'playwright';

async function debug() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Listen for network requests
  page.on('request', request => {
    if (request.url().includes('api.github.com')) {
      console.log('Request:', request.url());
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('api.github.com')) {
      console.log('Response:', response.status(), response.url());
    }
  });
  
  await page.goto('https://mitosis.zenheart.site/');
  await page.waitForTimeout(5000);
  
  // Check if apps are rendered
  const appItems = await page.locator('.app-item').count();
  console.log('App items:', appItems);
  
  // Check if there are any errors
  const errors = await page.evaluate(() => {
    return window.__errors || [];
  });
  console.log('Errors:', errors);
  
  await browser.close();
}

debug().catch(console.error);
