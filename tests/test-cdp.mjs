import { chromium } from '@playwright/test'

async function main() {
  const wsEndpoint = 'ws://127.0.0.1:9222/devtools/browser/82c92bc7-c8c5-4a86-918c-0539783746c2'
  console.log('Connecting to Chrome via CDP...')
  try {
    const browser = await chromium.connectOverCDP(wsEndpoint)
    console.log('Connected!')
    const contexts = browser.contexts()
    console.log(`Contexts: ${contexts.length}`)
    for (const ctx of contexts) {
      const pages = ctx.pages()
      console.log(`  Pages in context: ${pages.length}`)
      for (const page of pages) {
        console.log(`    - ${page.url()}`)
      }
    }
    await browser.close()
    console.log('Done')
  } catch (e) {
    console.error('Failed:', e.message)
  }
}

main()
