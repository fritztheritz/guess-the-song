import { useState } from 'react'

/**
 * Loads one entity from a synchronous store (localStorage repositories) by id, and reloads
 * it if the id changes — the "adjust state while rendering" pattern rather than an effect,
 * so there's no blank first render and no cascading re-render. Returns null for a missing
 * id or a not-found entity; the setter is for callers that save changes back and keep the
 * saved copy.
 */
export function useStoredEntity<T>(id: string | undefined, load: (id: string) => T | null) {
  const [value, setValue] = useState<T | null>(() => (id ? load(id) : null))
  const [loadedId, setLoadedId] = useState(id)
  if (id !== loadedId) {
    setLoadedId(id)
    setValue(id ? load(id) : null)
  }
  return [value, setValue] as const
}
