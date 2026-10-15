import { expect, test, type Page } from '@playwright/test'

// Screenshot checks for the screens people look at most. Time is frozen and the data is fixed, so the only
// thing that can change a screenshot is the UI itself. See playwright.config.ts for how to run/refresh these.
const NOW = new Date('2026-03-14T20:00:00.000Z')
const STAMP = '2026-03-14T19:30:00.000Z'

async function seed(page: Page) {
  await page.clock.setFixedTime(NOW)
  // A fixed random sequence, so shuffled orders (Blind Ranking's song order, confetti) are the same every run.
  await page.addInitScript(() => {
    let a = 0x9e3779b9
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })
  await page.goto('./')
  await page.evaluate((stamp) => {
    const round = (i: number) => ({ id: `r${i}`, source: 'soundcloud', title: `Song ${i}`, artist: `Artist ${i}`, clipStart: 0, clipDurations: [5, 10], points: [4, 3, 2, 1], createdAt: stamp })
    const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((n, i) => ({ id: `t${i}`, name: n, score: [7, 5, 3, 0][i], color: ['#ff6a13', '#17b8a6', '#3b82f6', '#ec4899'][i] }))
    const live = { id: 'g1', name: 'Friday Night', rounds: [1, 2, 3].map(round), teams, mode: 'song', createdAt: stamp, updatedAt: stamp, tags: ['friday'] }
    const history = [
      { index: 0, title: 'Song 1', artist: 'Artist 1', scores: { t0: 4, t1: 0, t2: 0, t3: 0 }, gains: { t0: 4 } },
      { index: 1, title: 'Song 2', artist: 'Artist 2', scores: { t0: 4, t1: 3, t2: 2, t3: 0 }, gains: { t1: 3, t2: 2 } },
      { index: 2, title: 'Song 3', artist: 'Artist 3', scores: { t0: 7, t1: 5, t2: 3, t3: 0 }, gains: { t0: 3, t1: 2, t2: 1 } },
    ]
    const playerStats = [
      { name: 'Ann', teamName: 'Alpha', buzzes: 3, correct: 3, wrong: 0, points: 7, fastestMs: 640 },
      { name: 'Bo', teamName: 'Bravo', buzzes: 2, correct: 2, wrong: 1, points: 5, fastestMs: 910 },
    ]
    const done = { ...live, id: 'g2', name: 'Last Week', progress: { possessionIndex: 2, completed: true }, history, playerStats }
    localStorage.setItem('gts.games.v1', JSON.stringify({ g1: live, g2: done }))
    const tiers = ['S', 'A', 'B'].map((name, i) => ({ id: `tier${i}`, name, color: ['#ef4444', '#f97316', '#eab308'][i] }))
    const songs = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `Tune ${i + 1}`, artist: 'Band', tierId: i < 3 ? 'tier0' : null, order: i }))
    localStorage.setItem('gts.tierlists.v1', JSON.stringify({ tl1: { id: 'tl1', name: 'Party Mix', tiers, songs, createdAt: stamp, updatedAt: stamp } }))
    localStorage.setItem('gts.seasons.v1', JSON.stringify({ s1: { id: 's1', name: 'Spring League', tag: 'friday', createdAt: stamp, updatedAt: stamp } }))
    localStorage.setItem('gts.flags.v1', JSON.stringify({ 'tier-lists': true, seasons: true, achievements: true }))
    localStorage.setItem('gts.sound-muted', '1')
  }, STAMP)
}

const SCREENS: Array<[name: string, path: string, before?: (page: Page) => Promise<void>]> = [
  ['home', ''],
  ['new-game', 'new'],
  ['settings', 'settings'],
  ['stats', 'stats'],
  ['tier-list', 'tierlists/tl1/present'],
  ['replay', 'games/g2/replay'],
  ['player-card', 'players/Ann'],
  ['season', 'seasons/s1'],
  [
    'empty-search',
    '',
    async (page) => {
      await page.getByPlaceholder(/Search everything/).fill('zzzz')
    },
  ],
  ['blind-lobby', 'tierlists/tl1/rank-together'],
  [
    'blind-playing',
    'tierlists/tl1/rank-together',
    async (page) => {
      await page.getByRole('button', { name: /START/ }).click()
      await page.getByRole('button', { name: /^Slot 1, empty/ }).click()
      await page.getByRole('button', { name: /LOCK IN/ }).click()
      await page.getByRole('button', { name: /NEXT SONG/ }).click()
      await page.getByRole('button', { name: /^Slot 3, empty/ }).click()
    },
  ],
  [
    'blind-results',
    'tierlists/tl1/rank-together',
    async (page) => {
      await page.getByRole('button', { name: /START/ }).click()
      for (let i = 1; i <= 8; i++) {
        await page.getByRole('button', { name: new RegExp(`^Slot ${i}, empty`) }).click()
        await page.getByRole('button', { name: /LOCK IN/ }).click()
        await page.getByRole('button', { name: /NEXT SONG|SEE RESULTS/ }).click()
      }
    },
  ],
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
  ['tablet', { width: 820, height: 1100 }],
] as const) {
  test.describe(device, () => {
    test.use({ viewport })
    for (const [name, path, before] of SCREENS) {
      // The tablet width only needs the screens that lay out differently between phone and desktop.
      if (device === 'tablet' && !['home', 'stats', 'new-game', 'tier-list', 'season', 'replay'].includes(name)) continue
      test(`${name} looks right`, async ({ page }) => {
        await seed(page)
        await page.goto(path)
        await before?.(page)
        await page.addStyleTag({ content: '.animate-confetti-fall { display: none !important }' })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400)
        await expect(page).toHaveScreenshot(`${device}-${name}.png`, { fullPage: true })
      })
    }
  })
}
