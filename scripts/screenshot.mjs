/**
 * screenshot.mjs – Headless screenshot av spillet for visuell debugging.
 */
import puppeteer from 'puppeteer'

const url = process.argv[2] || 'http://localhost:5199'
const output = process.argv[3] || '/tmp/larkollen-screenshot.png'
const WAIT_MS = parseInt(process.argv[4] || '8000')

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
    ],
    defaultViewport: { width: 1280, height: 720 },
  })
  const page = await browser.newPage()

  const logs = []
  page.on('console', msg => {
    const text = msg.text()
    if (text.includes('[Buildings]') || text.includes('Error') || text.includes('error') ||
        text.includes('Larkollen') || text.includes('[DEBUG]')) {
      logs.push(`[${msg.type()}] ${text}`)
    }
  })
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`))

  console.log(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

  console.log(`Waiting ${WAIT_MS / 1000}s for 3D scene...`)
  await new Promise(r => setTimeout(r, WAIT_MS))

  // Click to start
  await page.mouse.click(640, 360)
  await new Promise(r => setTimeout(r, 2000))

  // Press Enter to start game
  await page.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 2000))

  // Simulate movement: press W (forward) for a bit to get near buildings
  await page.keyboard.down('w')
  await new Promise(r => setTimeout(r, 3000))
  await page.keyboard.up('w')
  await new Promise(r => setTimeout(r, 500))

  await page.screenshot({ path: output, fullPage: false })
  console.log(`Screenshot saved: ${output}`)

  if (logs.length > 0) {
    console.log('\n── Console logs ──')
    for (const log of logs) console.log(log)
  }

  await browser.close()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
