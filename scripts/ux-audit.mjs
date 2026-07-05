import { chromium } from 'playwright'

async function main() {
  console.log('🔗 连接到 Chrome (port 9223)...')
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
  const contexts = browser.contexts()
  const ctx = contexts[0]
  if (!ctx) { console.error('无可用 context'); process.exit(1) }
  
  const pages = ctx.pages()
  let page = pages[0]
  
  const existing = pages.find(p => p.url().includes('mitosis.zenheart.site'))
  if (existing) {
    page = existing
    console.log(`  复用已有标签页: ${page.url().slice(0, 60)}`)
  } else {
    page = await ctx.newPage()
  }
  
  await page.goto('https://mitosis.zenheart.site/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  
  const outDir = '/Users/zenheart/code/github/mitosis/screenshots/ux-audit'
  const { mkdirSync } = await import('fs')
  mkdirSync(outDir, { recursive: true })
  
  // 1. Desktop full
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${outDir}/01-desktop-full.png`, fullPage: true })
  console.log('  📸 01-desktop-full.png')
  
  // 2. Desktop workspace
  const workspace = await page.locator('[class*="workspace"], .main-content, main').first()
  if (await workspace.count() > 0) {
    await workspace.screenshot({ path: `${outDir}/02-desktop-workspace.png` })
    console.log('  📸 02-desktop-workspace.png')
  }
  
  // 3. Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${outDir}/03-mobile-full.png`, fullPage: true })
  console.log('  📸 03-mobile-full.png')
  
  // 4. Mobile input
  const mobileInput = await page.locator('textarea.chat-input, .input-area').first()
  if (await mobileInput.count() > 0) {
    await mobileInput.screenshot({ path: `${outDir}/04-mobile-input.png` })
    console.log('  📸 04-mobile-input.png')
  }
  
  // 5. Mobile sidebar
  const sidebar = await page.locator('[class*="sidebar"], aside').first()
  if (await sidebar.count() > 0) {
    await sidebar.screenshot({ path: `${outDir}/05-mobile-sidebar.png` })
    console.log('  📸 05-mobile-sidebar.png')
  }
  
  // 6. Mobile header
  const header = await page.locator('header, [class*="header"]').first()
  if (await header.count() > 0) {
    await header.screenshot({ path: `${outDir}/06-mobile-header.png` })
    console.log('  📸 06-mobile-header.png')
  }
  
  // DOM info
  const domInfo = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel)
    const qa = (sel) => Array.from(document.querySelectorAll(sel))
    const rect = (el) => el ? el.getBoundingClientRect() : null
    const input = q('textarea.chat-input')
    const sendBtn = q('.send-btn')
    const attachBtn = q('.attach-btn')
    const sidebar = q('[class*="sidebar"], aside')
    const sessionItems = qa('.session-item')
    const appCards = qa('[class*="app-card"]')
    const galleryItems = qa('[class*="gallery"], [class*="app-item"]')
    
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      input: input ? { ...rect(input), disabled: input.disabled, placeholder: input.placeholder } : null,
      sendBtn: sendBtn ? { ...rect(sendBtn), disabled: sendBtn.disabled } : null,
      sidebar: sidebar ? { ...rect(sidebar) } : null,
      sessionCount: sessionItems.length,
      appCardCount: appCards.length + galleryItems.length,
      hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyPadding: getComputedStyle(document.body).padding,
    }
  })
  
  console.log('\n📊 DOM 分析:')
  console.log(JSON.stringify(domInfo, null, 2))
  
  // CSS variables
  const cssVars = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    const vars = {}
    for (let i = 0; i < styles.length; i++) {
      const name = styles[i]
      if (name.startsWith('--')) vars[name] = styles.getPropertyValue(name).trim()
    }
    return vars
  })
  console.log('\n🎨 CSS 变量:', Object.keys(cssVars).join(', '))
  
  console.log('\n✅ UX 审计截图完成 → screenshots/ux-audit/')
  
  await browser.close()
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
