import { useState, type ReactNode } from 'react'
import BackLink from '../components/BackLink'
import ThemePicker from '../components/ThemePicker'
import Panel from '../components/ui/Panel'
import Switch from '../components/ui/Switch'
import ButtonLink from '../components/ui/ButtonLink'
import Button from '../components/ui/Button'
import { getSoundVolume, isSoundMuted, setSoundMuted, setSoundVolume, playCorrect, playHorn } from '../lib/sound-effects'
import { getArenaFx, getKeepAwake, setArenaFx, setKeepAwake } from '../lib/settings'
import { THEME_PRESETS, getStoredTheme } from '../lib/themes'
import { useFeatureFlag } from '../state/feature-flags-context'
import { Icon } from '../components/Icon'

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const Toggle = Switch

// One home for the per-device preferences that used to be scattered (a sound button on each screen, a theme
// button on Home, flags on their own page). Everything here applies immediately and lives on this device only.
export default function Settings() {
  const themesEnabled = useFeatureFlag('themes')
  const [muted, setMuted] = useState(() => isSoundMuted())
  const [volume, setVolume] = useState(() => getSoundVolume())
  const [arenaFx, setArenaFxState] = useState(() => getArenaFx())
  const [keepAwake, setKeepAwakeState] = useState(() => getKeepAwake())
  const [themeOpen, setThemeOpen] = useState(false)
  const [themeId, setThemeId] = useState(() => getStoredTheme().id)
  const themeName = THEME_PRESETS.find((p) => p.id === themeId)?.name ?? (themeId === 'custom' ? 'Custom' : 'Default')

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 flex flex-col-reverse items-start gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <div>
            <h1 className="title-page">SETTINGS</h1>
            <p className="mt-1 text-sm text-slate-400">These apply to this device only and save as you change them.</p>
          </div>
          <BackLink to="/">Home</BackLink>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="set-sound">
            <h2 id="set-sound" className="mb-2 font-display text-xl tracking-wide text-slate-300">
              SOUND
            </h2>
            <Panel padding="md" className="divide-y divide-arena-700 py-1">
              <Row title="Sound effects" hint="Buzzers, fanfares and the soundboard.">
                <Toggle
                  label="Sound effects"
                  on={!muted}
                  onChange={(on) => {
                    setSoundMuted(!on)
                    setMuted(!on)
                  }}
                />
              </Row>
              <Row title="Court & crowd sounds" hint="Sneaker squeaks, net swishes, the lock-in horn and the crowd roar.">
                <Toggle
                  label="Court and crowd sounds"
                  on={arenaFx}
                  onChange={(on) => {
                    setArenaFx(on)
                    setArenaFxState(on)
                    if (on) playHorn()
                  }}
                />
              </Row>
              <Row title="Volume" hint={muted ? 'Turn sound effects on to hear it.' : undefined}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setSoundVolume(next)
                      setVolume(next)
                    }}
                    onPointerUp={() => !muted && playCorrect()}
                    aria-label="Sound volume"
                    className="w-40 accent-hardwood-500"
                  />
                  <span className="scoreboard-digit w-8 text-right font-display text-lg text-slate-300">{volume}</span>
                </div>
              </Row>
            </Panel>
          </section>

          <section aria-labelledby="set-screen">
            <h2 id="set-screen" className="mb-2 font-display text-xl tracking-wide text-slate-300">
              SCREEN
            </h2>
            <Panel padding="md" className="divide-y divide-arena-700 py-1">
              <Row title="Keep the screen awake during games" hint="Stops phones and TVs from sleeping mid-game. Turn off to save battery.">
                <Toggle
                  label="Keep the screen awake"
                  on={keepAwake}
                  onChange={(on) => {
                    setKeepAwake(on)
                    setKeepAwakeState(on)
                  }}
                />
              </Row>
              {themesEnabled && (
                <Row title="Venue theme" hint={`Currently ${themeName}.`}>
                  <Button variant="outline" size="sm" onClick={() => setThemeOpen(true)}>
                    <Icon name="palette" /> Change theme
                  </Button>
                </Row>
              )}
            </Panel>
          </section>

          <section aria-labelledby="set-more">
            <h2 id="set-more" className="mb-2 font-display text-xl tracking-wide text-slate-300">
              MORE
            </h2>
            <Panel padding="md" className="divide-y divide-arena-700 py-1">
              <Row title="Feature flags" hint="Try features that aren't on for everyone yet.">
                <ButtonLink to="/admin" size="sm">
                  Open
                </ButtonLink>
              </Row>
              <Row title="Stats" hint="Win rates, awards and player profiles.">
                <ButtonLink to="/stats" size="sm">
                  Open
                </ButtonLink>
              </Row>
              <Row title="Backup & restore" hint="Export everything or restore from a file or cloud code — on the Home page.">
                <ButtonLink to="/" size="sm">
                  Go to Home
                </ButtonLink>
              </Row>
            </Panel>
          </section>
        </div>
      </div>
      {themeOpen && (
        <ThemePicker
          onClose={() => {
            setThemeOpen(false)
            setThemeId(getStoredTheme().id)
          }}
        />
      )}
    </div>
  )
}
