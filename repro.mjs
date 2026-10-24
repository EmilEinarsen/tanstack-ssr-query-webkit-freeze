// Builds and serves the production app, then loads it in Playwright WebKit,
// one fresh browser context per round. A round is frozen when the page's main
// thread stops answering: page.evaluate(() => 1) gets no reply within 15 s
// (checked 1 s after `load`, by which time the ssr-query stream has ended).
//
//   ROUNDS=400        rounds to run (default 200)
//   CONCURRENCY=4     parallel browsers (default 4)
//   PRESSURE=1        load /?pressure: constant allocation for 3 s (see README)
//   NO_RELEASE_LOCK=1 build with the releaseLock() call removed (the fix in PR #8796)
//   STOP_AFTER=3      stop once this many rounds froze (default: never)
import { execSync, spawn } from 'node:child_process'
import { webkit } from '@playwright/test'

const ROUNDS = Number(process.env.ROUNDS ?? 200)
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4)
const STOP_AFTER = Number(process.env.STOP_AFTER ?? Infinity)
const FREEZE_MS = 15_000
const PORT = 3123
const URL = `http://localhost:${PORT}/${process.env.PRESSURE === '1' ? '?pressure' : ''}`
const variant = process.env.NO_RELEASE_LOCK === '1' ? 'releaseLock() removed' : 'releaseLock() as published'

if (process.env.SKIP_BUILD !== '1') execSync('npx vite build', { stdio: 'inherit' })
const server = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' })
await waitForServer()

let next = 0
let done = 0
let frozen = 0
let broken = 0
const started = Date.now()
const version = await webkit.launch().then(async (b) => [b.version(), await b.close()][0])
console.log(`WebKit ${version}, ${variant}, ${URL}, ${ROUNDS} rounds, concurrency ${CONCURRENCY}`)

await Promise.all(Array.from({ length: CONCURRENCY }, worker))
server.kill()
const minutes = ((Date.now() - started) / 60_000).toFixed(1)
console.log(`\nRESULT: ${frozen} frozen / ${done} rounds (${broken} rendered wrong) | WebKit ${version} | ${variant} | ${minutes} min`)
process.exit(0)

async function worker() {
  let browser = await webkit.launch()
  while (next < ROUNDS && frozen < STOP_AFTER) {
    const round = ++next
    const result = await runRound(browser)
    done++
    if (result === 'frozen') {
      frozen++
      console.log(`round ${round}: FROZEN (${frozen} so far)`)
      // A deadlocked web process may not close cleanly; start a new browser.
      await Promise.race([browser.close(), sleep(5_000)])
      browser = await webkit.launch()
    } else if (result !== 'ok') {
      broken++
      console.log(`round ${round}: ${result}`)
    }
    if (done % 25 === 0) console.log(`${done} rounds, ${frozen} frozen`)
  }
  await Promise.race([browser.close(), sleep(5_000)])
}

async function runRound(browser) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const loaded = await page.goto(URL, { waitUntil: 'load', timeout: 30_000 }).then(
      () => true,
      () => false,
    )
    if (!loaded) return 'frozen'
    // The stream ends shortly after load; give it time to reach releaseLock().
    await sleep(1_000)
    const answered = await Promise.race([page.evaluate(() => 1).then(() => true, () => false), sleep(FREEZE_MS).then(() => false)])
    if (!answered) return 'frozen'
    const text = await page.evaluate(() => document.body.innerText)
    return text.includes('item 6: 200 rows') && !text.includes('loading') ? 'ok' : `unexpected page: ${JSON.stringify(text.slice(0, 120))}`
  } finally {
    await Promise.race([context.close(), sleep(5_000)])
  }
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (await fetch(URL).then((r) => r.ok, () => false)) return
    await sleep(200)
  }
  throw new Error('server did not start')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
