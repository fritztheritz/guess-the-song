import { expect, test, type Page } from '@playwright/test'

// Seeds localStorage directly (the app is localStorage-only), so the tests don't depend on
// SoundCloud/Spotify or any network service.
async function seed(page: Page) {
  await page.goto('./')
  await page.evaluate(() => {
    const now = new Date().toISOString()
    const round = (i: number) => ({
      id: `r${i}`,
      source: 'soundcloud',
      title: `Song ${i}`,
      artist: `Artist ${i}`,
      clipStart: 0,
      clipDurations: [5, 10],
      points: [4, 3, 2, 1],
      createdAt: now,
    })
    const teams = [
      { id: 't1', name: 'Alpha', score: 0, color: '#e8871e' },
      { id: 't2', name: 'Bravo', score: 0, color: '#17b8a6' },
    ]
    const game = { id: 'g1', name: 'Smoke Game', rounds: [round(1), round(2)], teams, mode: 'song', createdAt: now, updatedAt: now }
    localStorage.setItem('gts.games.v1', JSON.stringify({ g1: game }))
    const tiers = ['S', 'A', 'B'].map((name, i) => ({ id: `tier${i}`, name, color: ['#ef4444', '#f97316', '#eab308'][i] }))
    const songs = [1, 2, 3].map((i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `Tune ${i}`, artist: 'Band', tierId: null, order: i }))
    localStorage.setItem('gts.tierlists.v1', JSON.stringify({ tl1: { id: 'tl1', name: 'Smoke Tiers', tiers, songs, createdAt: now, updatedAt: now } }))
    localStorage.setItem('gts.flags.v1', JSON.stringify({ 'tier-lists': true }))
  })
}

test('home lists a saved game and tier list', async ({ page }) => {
  await seed(page)
  await page.goto('./')
  await expect(page.getByText('Smoke Game').first()).toBeVisible()
  await expect(page.getByText('Smoke Tiers').first()).toBeVisible()
})

test('play a Song game start to finish', async ({ page }) => {
  await seed(page)
  await page.goto('games/g1/present')
  await page.getByRole('button', { name: /TIP OFF/ }).click()
  await page.getByRole('button', { name: /REVEAL ANSWER/ }).click()
  await page.getByRole('button', { name: /Alpha \+4/ }).click()
  await expect(page.getByText('Bucket!')).toBeVisible()

  // A mis-tap can be taken back.
  await page.getByText('Undo award').click()
  await expect(page.getByText('Who got the bucket?')).toBeVisible()
  await page.getByRole('button', { name: /Bravo \+4/ }).click()

  await page.getByRole('button', { name: /NEXT POSSESSION/ }).click()
  await page.getByRole('button', { name: /REVEAL ANSWER/ }).click()
  await page.getByRole('button', { name: /NO SCORE/ }).click()
  await page.getByRole('button', { name: /FINAL SCORE/ }).click()
  await expect(page.getByText('Bravo').first()).toBeVisible()

  // The finished game can be replayed possession by possession.
  await page.getByRole('button', { name: /REPLAY/ }).click()
  await expect(page.getByRole('img', { name: /Score by possession/ })).toBeVisible()
  await expect(page.getByText('POSSESSION BY POSSESSION')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(2)
})

test('rank a tier list with the keyboard and undo', async ({ page }) => {
  await seed(page)
  await page.goto('tierlists/tl1/present')
  await expect(page.getByText('0/3')).toBeVisible()
  await page.keyboard.press('1')
  await page.keyboard.press('2')
  await expect(page.getByText('2/3')).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('1/3')).toBeVisible()
  await page.keyboard.press('3')
  await page.keyboard.press('3')
  await expect(page.getByText('ALL RANKED')).toBeVisible()
})

test('the builder creates a tier list from a preset', async ({ page }) => {
  await seed(page)
  await page.goto('tierlists/new')
  await page.getByRole('button', { name: '5 stars' }).click()
  await page.getByRole('button', { name: /ADD SONGS/ }).click()
  await expect(page.getByLabel('Tier list name')).toBeVisible()
  await expect(page.getByLabel('Tier preview')).toContainText('★★★★★')
})

test('quick game page offers teams, song count and a source', async ({ page }) => {
  await page.goto('quick')
  await expect(page.getByRole('heading', { name: 'QUICK GAME' })).toBeVisible()
  await page.getByRole('button', { name: '4', exact: true }).first().click()
  await page.getByRole('button', { name: '15' }).click()
  await expect(page.getByRole('button', { name: /PICK FROM SOUNDCLOUD/ })).toBeVisible()
})

test('a player profile shows career totals from finished games', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    const now = new Date().toISOString()
    const teams = [
      { id: 't1', name: 'Alpha', score: 9, color: '#e8871e' },
      { id: 't2', name: 'Bravo', score: 3, color: '#17b8a6' },
    ]
    const game = {
      id: 'done', name: 'Finished Game', rounds: [], teams, mode: 'song', createdAt: now, updatedAt: now,
      progress: { possessionIndex: 0, completed: true },
      playerStats: [{ name: 'Sam', teamName: 'Alpha', buzzes: 4, correct: 3, wrong: 1, points: 9, fastestMs: 640 }],
    }
    localStorage.setItem('gts.games.v1', JSON.stringify({ done: game }))
  })
  await page.goto('players/Sam')
  await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible()
  await expect(page.getByText('75%')).toBeVisible()
  await expect(page.getByText('0.64s', { exact: true })).toBeVisible()
  await expect(page.getByText('Finished Game').first()).toBeVisible()
})

test('play a Higher or Lower game and see the rank reveal', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    const now = new Date().toISOString()
    const ref = { title: 'Opener', artist: 'X', rank: 4, tierName: 'B' }
    const round = (i: number, rank: number) => ({
      id: `r${i}`, source: 'soundcloud', title: `Next ${i}`, artist: 'X', clipStart: 0, clipDurations: [5], points: [4], createdAt: now,
      higherLower: { rank, size: 8, tierName: 'A', ref: { ...ref, title: i === 1 ? 'Opener' : `Next ${i - 1}`, rank: i === 1 ? 4 : 2 } },
    })
    const teams = [
      { id: 't1', name: 'Alpha', score: 0, color: '#e8871e' },
      { id: 't2', name: 'Bravo', score: 0, color: '#17b8a6' },
    ]
    const game = { id: 'hl', name: 'HL Game', rounds: [round(1, 2), round(2, 6)], teams, mode: 'higherlower', createdAt: now, updatedAt: now }
    localStorage.setItem('gts.games.v1', JSON.stringify({ hl: game }))
    localStorage.setItem('gts.flags.v1', JSON.stringify({ 'tier-lists': true }))
  })
  await page.goto('games/hl/present')
  await page.getByRole('button', { name: /TIP OFF/ }).click()
  await expect(page.getByText('HIGHER OR LOWER?')).toBeVisible()
  await page.getByRole('button', { name: /REVEAL RANK/ }).click()
  await expect(page.getByText('HIGHER', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Alpha' }).first().click()
  await expect(page.locator('.scoreboard-digit').first()).toHaveText('2')
  await page.getByRole('button', { name: /NEXT POSSESSION/ }).click()
  await page.getByRole('button', { name: /REVEAL RANK/ }).click()
  await expect(page.getByText('LOWER', { exact: true }).first()).toBeVisible()
})

test('blind ranking explains it needs phone buzz-in when that is off', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    const now = new Date().toISOString()
    const tiers = [{ id: 'a', name: 'S', color: '#ef4444' }]
    const songs = [1, 2, 3].map((i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `T${i}`, artist: 'B', tierId: null, order: i }))
    localStorage.setItem('gts.tierlists.v1', JSON.stringify({ tl: { id: 'tl', name: 'L', tiers, songs, createdAt: now, updatedAt: now } }))
    localStorage.setItem('gts.flags.v1', JSON.stringify({ 'tier-lists': true, 'phone-buzzer': false }))
  })
  await page.goto('tierlists/tl/blind')
  await expect(page.getByText(/turn on Phone Buzz-In/)).toBeVisible()
})

test('one-screen blind ranking: slots lock in and the result saves as a tier list', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    const now = new Date().toISOString()
    const tiers = [{ id: 'a', name: 'S', color: '#ef4444' }, { id: 'b', name: 'A', color: '#f97316' }]
    const songs = [1, 2, 3].map((i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `T${i}`, artist: 'B', tierId: null, order: i }))
    localStorage.setItem('gts.tierlists.v1', JSON.stringify({ tl: { id: 'tl', name: 'L', tiers, songs, createdAt: now, updatedAt: now } }))
    localStorage.setItem('gts.flags.v1', JSON.stringify({ 'tier-lists': true }))
  })
  await page.goto('tierlists/tl/rank-together')
  await page.getByRole('button', { name: /START/ }).click()
  // Pick slot 2 for the first song, lock it, and the slot becomes unusable.
  await page.getByRole('button', { name: 'Slot 2, empty' }).click()
  await page.getByRole('button', { name: /LOCK IN #2/ }).click()
  await expect(page.getByRole('button', { name: /^Slot 2: / })).toBeDisabled()
  // A reload mid-game picks up where it left off.
  await page.reload()
  await expect(page.getByRole('button', { name: /^Slot 2: / })).toBeDisabled()
  await page.getByRole('button', { name: /NEXT SONG/ }).click()
  await page.getByRole('button', { name: 'Slot 1, empty' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Slot 3, empty' }).click()
  await page.getByRole('button', { name: /LOCK IN #3/ }).click()
  await page.getByRole('button', { name: /SEE RESULTS/ }).click()
  await page.getByRole('button', { name: /Save as tier list/ }).click()
  await expect(page).toHaveURL(/tierlists\/.+\/present/)
  await expect(page.getByText('L — group ranking').first()).toBeVisible()
})

test('creating a game walks through three steps', async ({ page }) => {
  await page.goto('new')
  await expect(page.getByRole('heading', { name: 'NEW GAME' })).toBeVisible()
  await page.getByLabel('Game name').fill('Wizard Night')
  await page.getByRole('button', { name: /NEXT/ }).click()
  await expect(page.getByText('Choose teams')).toBeVisible()
  await page.getByRole('button', { name: /NEXT/ }).click()
  await expect(page.getByText(/How Guess the Song scores/)).toBeVisible()
  // Back keeps what was typed.
  await page.getByRole('button', { name: /Back/ }).click()
  await page.getByRole('button', { name: /Back/ }).click()
  await expect(page.getByLabel('Game name')).toHaveValue('Wizard Night')
})

test('⌘K jumps to a saved game by name', async ({ page }) => {
  await seed(page)
  await page.goto('./')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Jump to' })).toBeVisible()
  await page.keyboard.type('smoke tiers')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/tierlists\/tl1\/present/)
})

test('settings are remembered', async ({ page }) => {
  await page.goto('settings')
  await page.getByRole('switch', { name: 'Keep the screen awake' }).click()
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Keep the screen awake' })).toHaveAttribute('aria-checked', 'false')
})
