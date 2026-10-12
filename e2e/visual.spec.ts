import { expect, test, type Page } from '@playwright/test'

// Screenshot checks for the screens people look at most. Time is frozen and the data is fixed, so the only
// thing that can change a screenshot is the UI itself. See playwright.config.ts for how to run/refresh these.
const NOW = new Date('2026-03-14T20:00:00.000Z')
const STAMP = '2026-03-14T19:30:00.000Z'

async function seed(page: Page) {
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await page.evaluate((stamp) => {
    const round = (i: number) => ({ id: `r${i}`, source: 'soundcloud', title: `Song ${i}`, artist: `Artist ${i}`, clipStart: 0, clipDurations: [5, 10], points: [4, 3, 2, 1], createdAt: stamp })
    const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((n, i) => ({ id: `t${i}`, name: n, score: [7, 5, 3, 0][i], color: ['#e8871e', '#17b8a6', '#3b82f6', '#ec4899'][i] }))
    const live = { id: 'g1', name: 'Friday Night', rounds: [1, 2, 3].map(round), teams, mode: 'song', createdAt: stamp, updatedAt: stamp, tags: ['friday'] }
    const done = { ...live, id: 'g2', name: 'Last Week', progress: { possessionIndex: 2, completed: true } }
    localStorage.setItem('gts.games.v1', JSON.stringify({ g1: live, g2: done }))
    const tiers = ['S', 'A', 'B'].map((name, i) => ({ id: `tier${i}`, name, color: ['#ef4444', '#f97316', '#eab308'][i] }))
    const songs = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `Tune ${i + 1}`, artist: 'Band', tierId: i < 3 ? 'tier0' : null, order: i }))
    localStorage.setItem('gts.tierlists.v1', JSON.stringify({ tl1: { id: 'tl1', name: 'Party Mix', tiers, songs, createdAt: stamp, updatedAt: stamp } }))
    localStorage.setItem('gts.flags.v1', JSON.stringify({ 'tier-lists': true }))
    localStorage.setItem('gts.sound-muted', '1')
  }, STAMP)
}

const SCREENS: Array<[name: string, path: string, before?: (page: Page) => Promise<void>]> = [
  ['home', ''],
  ['new-game', 'new'],
  ['settings', 'settings'],
  ['stats', 'stats'],
  ['tier-list', 'tierlists/tl1/present'],
  ['blind-lobby', 'tierlists/tl1/rank-together'],
  [
    'host-clue',
    'games/g1/present',
    async (page) => {
      await page.getByRole('button', { name: /TIP OFF/ }).click()
    },
  ],
]

for (const [device, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test.describe(device, () => {
    test.use({ viewport })
    for (const [name, path, before] of SCREENS) {
      test(`${name} looks right`, async ({ page }) => {
        await seed(page)
        await page.goto(path)
        await before?.(page)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400)
        await expect(page).toHaveScreenshot(`${device}-${name}.png`, { fullPage: true })
      })
    }
  })
}
