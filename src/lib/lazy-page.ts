import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'gts.chunk-reload'

/** React.lazy for a route, with one guarded recovery: after a new deploy an open tab's old chunk
 *  filenames 404, so the import fails — reload once to pick up the new build instead of leaving a
 *  blank page. (The flag stops a genuine outage from reload-looping.) */
export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory()
      try {
        sessionStorage.removeItem(RELOAD_KEY)
      } catch {
        // Best-effort only.
      }
      return mod
    } catch (err) {
      let alreadyTried = true
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_KEY) === '1'
        if (!alreadyTried) sessionStorage.setItem(RELOAD_KEY, '1')
      } catch {
        // Storage blocked — don't risk a reload loop.
      }
      if (!alreadyTried) {
        window.location.reload()
        return new Promise<never>(() => {})
      }
      throw err
    }
  })
}
