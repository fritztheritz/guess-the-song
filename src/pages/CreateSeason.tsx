import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptySeason } from '../types/season'
import { saveSeason } from '../lib/storage/season-repository'
import { listGames } from '../lib/storage/game-repository'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'

export default function CreateSeason() {
  const navigate = useNavigate()
  const [name, setName] = useState('Friday Night League')
  const [tag, setTag] = useState('')

  // Games are the only entity type with tags at all (Popularity/Timeline games don't carry
  // them — see Home.tsx) — every tag already in use there, so picking one of these (rather
  // than inventing a fresh tag) is what makes past weeks count immediately instead of the
  // season starting empty.
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>()
    listGames().forEach((g) => (g.tags ?? []).forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedTag = tag.trim()
    if (!trimmedTag) return
    const season = saveSeason(createEmptySeason(name.trim() || 'Untitled Season', trimmedTag))
    navigate(`/seasons/${season.id}`)
  }

  return (
    <div className="min-h-svh court-lines flex items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl">📅</div>
          <h1 className="font-display text-4xl tracking-wide text-white">NAME YOUR SEASON</h1>
          <p className="mt-2 text-sm text-slate-400">
            Pick a tag — any completed game carrying it counts toward this season's standings, automatically.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">Season name</label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">Tag</label>
          <TextInput
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            inputSize="lg"
            className="w-full"
            placeholder="e.g. Fall League 2026"
            list="season-tag-suggestions"
          />
          <datalist id="season-tag-suggestions">
            {tagSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-slate-500">
            Tag each week's game with this from now on — Home's tag editor works for this too.
          </p>
        </div>

        <Button type="submit" fullWidth size="lg" disabled={!tag.trim()}>
          CREATE SEASON →
        </Button>
      </form>
    </div>
  )
}
