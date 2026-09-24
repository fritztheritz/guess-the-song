import { useState, type KeyboardEvent } from 'react'

function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

// Chip-style editor: existing tags render as removable pills, typing + Enter/comma adds a
// new one, Backspace on an empty input pops the last tag (same feel as Gmail's "To" field).
// Suggestions come from every tag already used elsewhere in the library, purely so two
// games about the same night end up tagged "Friday Night" instead of "friday night" and
// "Fri Night" — case-insensitive dedupe against the current tags, not a hard validation rule.
export default function TagInput({
  tags,
  onChange,
  suggestions = [],
  listId,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  listId: string
}) {
  const [input, setInput] = useState('')

  function addTag(raw: string) {
    const tag = normalizeTag(raw)
    setInput('')
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return
    onChange([...tags, tag])
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  const availableSuggestions = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-arena-700 bg-arena-800 px-2 py-1.5 focus-within:border-hardwood-500">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-arena-700 px-2.5 py-1 text-xs text-slate-200">
          {tag}
          <button
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="text-slate-500 hover:text-scoreboard-500"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(input)}
        placeholder={tags.length === 0 ? 'Add a tag…' : ''}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-1 text-xs text-slate-200 outline-none placeholder:text-slate-600"
      />
      {availableSuggestions.length > 0 && (
        <datalist id={listId}>
          {availableSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  )
}
