/**
 * screenshot.mjs – Headless screenshot av spillet for visuell debugging.
 * Bruk: node scripts/screenshot.mjs [url] [output]
 */
import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:5199'
const output = process.argv[3] || '/tmp/larkollen-screenshot.png'
const WAIT_MS = 6000 // Vent på at 3D-scenen laster

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

  // Samle console-meldinger fra spillet
  const logs = []
  page.on('console', msg => {
    const text = msg.text()
    if (text.includes('Larkollen') || text.includes('kartdata') || text.includes('terreng') || text.includes('GLB') || text.includes('Error') || text.includes('error') || text.includes('fallback') || text.includes('[DEBUG]')) {
      logs.push(`[${msg.type()}] ${text}`)
    }
  })

  page.on('pageerror', err => {
    logs.push(`[PAGE_ERROR] ${err.message}`)
  })

  console.log(`Navigerer til ${url}...`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  console.log(`Venter ${WAIT_MS / 1000}s på 3D-scene...`)
  await page.waitForTimeout(WAIT_MS)

  // Klikk for å starte spillet (pointer lock)
  await page.mouse.click(640, 360)
  await page.waitForTimeout(2000)

  // Kjør diagnostikk i nettleseren
  try {
    const diag = await page.evaluate(() => {
      const info = {}
      // Sjekk player store
      if (window.__zustandStores?.player) {
        const state = window.__zustandStores.player.getState()
        info.playerPos = state.position
      }
      return info
    })
    if (Object.keys(diag).length > 0) logs.push(`[DIAG] ${JSON.stringify(diag)}`)
  } catch {}

  // Ta skjermbilde
  await page.screenshot({ path: output, fullPage: false })
  console.log(`Skjermbilde lagret: ${output}`)

  // Skriv ut relevante console-logger
  if (logs.length > 0) {
    console.log('\n── Relevante console-logger ──')
    for (const log of logs) console.log(log)
  }

  await browser.close()
}

main().catch(err => {
  console.error('Feil:', err.message)
  process.exit(1)
})
