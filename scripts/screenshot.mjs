import puppeteer from 'puppeteer'
const url = process.argv[2] || 'http://localhost:5199'
const output = process.argv[3] || '/tmp/larkollen-screenshot.png'
const WAIT_MS = parseInt(process.argv[4] || '10000')

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'],
    defaultViewport: { width: 1280, height: 720 },
  })
  const page = await browser.newPage()
  const logs = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`))

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, WAIT_MS))
  await page.mouse.click(640, 360)
  await new Promise(r => setTimeout(r, 1500))
  await page.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 3000))

  await page.screenshot({ path: output })
  console.log(`Screenshot: ${output}`)
  console.log(`\n── ALL ${logs.length} LOGS ──`)
  logs.forEach(l => console.log(l))
  await browser.close()
}
main().catch(e => { console.error(e.message); process.exit(1) })
