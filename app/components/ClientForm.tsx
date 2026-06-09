'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Platform, PromptCategory } from '@/lib/types'

const PLATFORMS: Platform[] = ['chatgpt', 'gemini', 'claude']
const CATEGORIES: PromptCategory[] = ['brand', 'category', 'comparison', 'local', 'problem']

interface CompetitorRow {
  name: string
  website: string
  brand_aliases: string // comma-separated in the form
}
interface PromptRow {
  text: string
  category: PromptCategory | ''
  platforms: Platform[]
}

export interface ClientFormInitial {
  name: string
  website: string
  industry: string
  contact_name: string
  contact_email: string
  brand_aliases: string[]
  target_keywords: string[]
  monthly_report_enabled: boolean
  report_day: number
  report_recipient_emails: string[]
  is_active: boolean
  competitors: { name: string; website: string | null; brand_aliases: string[] }[]
  prompts: { text: string; category: PromptCategory | null; platforms: Platform[] }[]
}

interface Props {
  mode: 'create' | 'edit'
  clientId?: string
  initial?: ClientFormInitial
}

const splitCsv = (s: string) =>
  s.split(',').map((x) => x.trim()).filter(Boolean)

export default function ClientForm({ mode, clientId, initial }: Props) {
  const router = useRouter()

  const [name, setName] = useState(initial?.name ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [industry, setIndustry] = useState(initial?.industry ?? '')
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '')
  const [brandAliases, setBrandAliases] = useState((initial?.brand_aliases ?? []).join(', '))
  const [keywords, setKeywords] = useState((initial?.target_keywords ?? []).join(', '))
  const [reportEnabled, setReportEnabled] = useState(initial?.monthly_report_enabled ?? true)
  const [reportDay, setReportDay] = useState(initial?.report_day ?? 1)
  const [recipients, setRecipients] = useState((initial?.report_recipient_emails ?? []).join(', '))
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  const [competitors, setCompetitors] = useState<CompetitorRow[]>(
    initial?.competitors.map((c) => ({
      name: c.name,
      website: c.website ?? '',
      brand_aliases: (c.brand_aliases ?? []).join(', '),
    })) ?? []
  )
  const [prompts, setPrompts] = useState<PromptRow[]>(
    initial?.prompts.map((p) => ({
      text: p.text,
      category: p.category ?? '',
      platforms: p.platforms?.length ? p.platforms : [...PLATFORMS],
    })) ?? [{ text: '', category: '', platforms: [...PLATFORMS] }]
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updatePrompt(i: number, patch: Partial<PromptRow>) {
    setPrompts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function togglePlatform(i: number, platform: Platform) {
    setPrompts((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r
        const has = r.platforms.includes(platform)
        return {
          ...r,
          platforms: has ? r.platforms.filter((p) => p !== platform) : [...r.platforms, platform],
        }
      })
    )
  }
  function updateCompetitor(i: number, patch: Partial<CompetitorRow>) {
    setCompetitors((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !website.trim()) {
      setError('Client name and website are required.')
      return
    }

    const payload = {
      name,
      website,
      industry,
      contact_name: contactName,
      contact_email: contactEmail,
      brand_aliases: splitCsv(brandAliases),
      target_keywords: splitCsv(keywords),
      monthly_report_enabled: reportEnabled,
      report_day: Number(reportDay),
      report_recipient_emails: splitCsv(recipients),
      is_active: isActive,
      competitors: competitors
        .filter((c) => c.name.trim())
        .map((c) => ({
          name: c.name,
          website: c.website || null,
          brand_aliases: splitCsv(c.brand_aliases),
        })),
      prompts: prompts
        .filter((p) => p.text.trim())
        .map((p) => ({
          text: p.text,
          category: p.category || null,
          platforms: p.platforms.length ? p.platforms : [...PLATFORMS],
        })),
    }

    setSaving(true)
    const url = mode === 'create' ? '/api/clients' : `/api/clients/${clientId}`
    const method = mode === 'create' ? 'POST' : 'PATCH'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save client')
        setSaving(false)
        return
      }
      router.push(`/clients/${data.id}`)
      router.refresh()
    } catch {
      setError('Network error while saving.')
      setSaving(false)
    }
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5'
  const hintCls = 'text-xs text-gray-400 mt-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Core details */}
      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Client details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Petico" />
          </div>
          <div>
            <label className={labelCls}>Website *</label>
            <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://petico.my" />
          </div>
          <div>
            <label className={labelCls}>Industry</label>
            <input className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Pet care e-commerce" />
          </div>
          <div>
            <label className={labelCls}>Brand aliases</label>
            <input className={inputCls} value={brandAliases} onChange={(e) => setBrandAliases(e.target.value)} placeholder="Petico, Petico MY" />
            <p className={hintCls}>Comma-separated. Alternate names the AI might use.</p>
          </div>
          <div>
            <label className={labelCls}>Contact name</label>
            <input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Contact email</label>
            <input type="email" className={inputCls} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Target keywords</label>
            <input className={inputCls} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="dog food, cat litter, pet grooming" />
            <p className={hintCls}>Comma-separated themes you track for this client.</p>
          </div>
        </div>
      </section>

      {/* Report settings */}
      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Monthly report</h2>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={reportEnabled} onChange={(e) => setReportEnabled(e.target.checked)} />
          Send a monthly visibility report
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Send on day of month</label>
            <input
              type="number"
              min={1}
              max={28}
              className={inputCls}
              value={reportDay}
              onChange={(e) => setReportDay(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelCls}>Recipient emails</label>
            <input className={inputCls} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="client@petico.my, ops@petico.my" />
            <p className={hintCls}>Comma-separated.</p>
          </div>
        </div>
        {mode === 'edit' && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Client is active
          </label>
        )}
      </section>

      {/* Competitors */}
      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Competitors</h2>
          <button
            type="button"
            onClick={() => setCompetitors((r) => [...r, { name: '', website: '', brand_aliases: '' }])}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Add competitor
          </button>
        </div>
        {competitors.length === 0 && <p className="text-xs text-gray-400">No competitors tracked.</p>}
        <div className="space-y-3">
          {competitors.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
              <input className={inputCls} placeholder="Name" value={c.name} onChange={(e) => updateCompetitor(i, { name: e.target.value })} />
              <input className={inputCls} placeholder="Website" value={c.website} onChange={(e) => updateCompetitor(i, { website: e.target.value })} />
              <input className={inputCls} placeholder="Aliases (comma-sep)" value={c.brand_aliases} onChange={(e) => updateCompetitor(i, { brand_aliases: e.target.value })} />
              <button
                type="button"
                onClick={() => setCompetitors((rows) => rows.filter((_, idx) => idx !== i))}
                className="text-gray-300 hover:text-red-500 px-2 py-2 text-sm"
                aria-label="Remove competitor"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Prompts */}
      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Tracked prompts</h2>
          <button
            type="button"
            onClick={() => setPrompts((r) => [...r, { text: '', category: '', platforms: [...PLATFORMS] }])}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Add prompt
          </button>
        </div>
        <p className="text-xs text-gray-400">
          These are the questions sent to each AI platform. The audit measures whether this client appears in the answers.
        </p>
        <div className="space-y-4">
          {prompts.map((p, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <textarea
                  className={`${inputCls} min-h-[44px] resize-y`}
                  placeholder="e.g. What are the best online pet stores in Malaysia?"
                  value={p.text}
                  onChange={(e) => updatePrompt(i, { text: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setPrompts((rows) => rows.filter((_, idx) => idx !== i))}
                  className="text-gray-300 hover:text-red-500 px-2 py-2 text-sm"
                  aria-label="Remove prompt"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <select
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-400"
                  value={p.category}
                  onChange={(e) => updatePrompt(i, { category: e.target.value as PromptCategory | '' })}
                >
                  <option value="">No category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div className="flex items-center gap-3">
                  {PLATFORMS.map((plat) => (
                    <label key={plat} className="flex items-center gap-1 text-xs text-gray-600 capitalize">
                      <input
                        type="checkbox"
                        checked={p.platforms.includes(plat)}
                        onChange={() => togglePlatform(i, plat)}
                      />
                      {plat}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href={mode === 'edit' && clientId ? `/clients/${clientId}` : '/'}
          className="text-sm text-gray-500 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="text-sm font-medium bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create client' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
