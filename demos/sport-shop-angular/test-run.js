const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  console.log("Navigating to http://localhost:4200/search?q=");
  await page.goto("http://localhost:4200/search?q=", { waitUntil: 'networkidle2' });
  
  console.log("Waiting for cards...");
  await page.waitForSelector('app-product-card');
  
  console.log("Clicking the first product card div...");
  await page.click('app-product-card div');
  
  await new Promise(r => setTimeout(r, 2000));
  console.log("Current URL:", page.url());
  await browser.close();
})();
