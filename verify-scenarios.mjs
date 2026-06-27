import { chromium } from 'playwright';

async function verifyScenarios() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = {
    scenario1: false,
    scenario2: false,
    scenario3: false,
    scenario4: false,
  };
  
  try {
    // Scenario 1: Gallery page loads with apps
    await page.goto('https://mitosis.zenheart.site/');
    await page.waitForTimeout(5000);
    
    const galleryTitle = await page.title();
    console.log(`Gallery title: ${galleryTitle}`);
    
    // Check if apps are listed
    const appItems = await page.locator('.app-item').count();
    console.log(`App items count: ${appItems}`);
    results.scenario1 = appItems > 0;
    
    // Scenario 3: Snake-game appears in Gallery
    const snakeGame = await page.locator('text=/snake-game/i').count();
    console.log(`Snake-game references: ${snakeGame}`);
    results.scenario3 = snakeGame > 0;
    
    // Check page content
    const content = await page.content();
    if (content.includes('snake-game') || content.includes('tetris-game')) {
      console.log('Apps found in page content');
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await browser.close();
  
  console.log('\n=== Results ===');
  console.log('Scenario 1 (Gallery loads with apps):', results.scenario1 ? 'PASS' : 'FAIL');
  console.log('Scenario 3 (Snake-game in Gallery):', results.scenario3 ? 'PASS' : 'FAIL');
  
  return results;
}

verifyScenarios().catch(console.error);
