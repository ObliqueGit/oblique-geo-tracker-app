'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Platform, PromptCategory } from '@/lib/types'

const PLATFORMS: Platform[] = ['chatgpt', 'gemini', 'claude']
const CATEGORIES: PromptCategory[] = ['brand', 'category', 'comparison', 'local', 'problem']

interface CompetitorRow { name: string; website: string; brand_aliases: string }
interface PromptRow { text: string; category: PromptCategory | ''; platforms: Platform[] }

export interface ClientFormInitial {
  name: string; website: string; industry: string; contact_name: string; contact_email: string
  brand_aliases: string[]; target_keywords: string[]; monthly_report_enabled: boolean
  report_day: number; report_recipient_emails: string[]; is_active: boolean
  competitors: { name: string; website: string | null; brand_aliases: string[] }[]
  prompts: { text: string; category: PromptCategory | null; platforms: Platform[] }[]
}

interface Props { mode: 'create' | 'edit'; clientId?: string; initial?: ClientFormInitial }

const splitCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

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
    initial?.competitors.map((c) => ({ name: c.name, website: c.website ?? '', brand_aliases: (c.brand_aliases ?? []).join(', ') })) ?? []
  )
  const [prompts, setPrompts] = useState<PromptRow[]>(
    initial?.prompts.map((p) => ({ text: p.text, category: p.category ?? '', platforms: p.platforms?.length ? p.platforms : [...PLATFORMS] })) ??
      [{ text: '', category: '', platforms: [...PLATFORMS] }]
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePrompt = (i: number, patch: Partial<PromptRow>) =>
    setPrompts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const togglePlatform = (i: number, platform: Platform) =>
    setPrompts((rows) => rows.map((r, idx) => {
      if (idx !== i) return r
      const has = r.platforms.includes(platform)
      return { ...r, platforms: has ? r.platforms.filter((p) => p !== platform) : [...r.platforms, platform] }
    }))
  const updateCompetitor = (i: number, patch: Partial<CompetitorRow>) =>
    setCompetitors((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !website.trim()) { setError('Client name and website are required.'); return }

    const payload = {
      name, website, industry, contact_name: contactName, contact_email: contactEmail,
      brand_aliases: splitCsv(brandAliases), target_keywords: splitCsv(keywords),
      monthly_report_enabled: reportEnabled, report_day: Number(reportDay),
      report_recipient_emails: splitCsv(recipients), is_active: isActive,
      competitors: competitors.filter((c) => c.name.trim()).map((c) => ({ name: c.name, website: c.website || null, brand_aliases: splitCsv(c.brand_aliases) })),
      prompts: prompts.filter((p) => p.text.trim()).map((p) => ({ text: p.text, category: p.category || null, platforms: p.platforms.length ? p.platforms : [...PLATFORMS] })),
    }

    setSaving(true)
    const url = mode === 'create' ? '/api/clients' : `/api/clients/${clientId}`
    const method = mode === 'create' ? 'POST' : 'PATCH'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save client'); setSaving(false); return }
      router.push(`/clients/${data.id}`)
      router.refresh()
    } catch { setError('Network error while saving.'); setSaving(false) }
  }

  const labelHalf = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } as const

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12.5, padding: '10px 12px', borderRadius: 'var(--r)', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="form-section">
        <div className="form-section-title">Basic info</div>
        <div style={labelHalf}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Client name</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Petico Malaysia" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Website</label>
            <input className="form-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. petico.my" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Industry</label>
          <input className="form-input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Pet Care E-commerce" />
        </div>
        <div className="form-group">
          <label className="form-label">Brand aliases</label>
          <span className="form-sublabel">Other names the AI might use for this client — comma-separated, all checked in responses.</span>
          <input className="form-input" value={brandAliases} onChange={(e) => setBrandAliases(e.target.value)} placeholder="Petico, Petico.my, Petico Malaysia" />
        </div>
        <div className="form-group">
          <label className="form-label">Target keywords</label>
          <span className="form-sublabel">Comma-separated themes you track for this client.</span>
          <input className="form-input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="dog food, cat litter, pet grooming" />
        </div>
        <div style={labelHalf}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Contact name</label>
            <input className="form-input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Contact email</label>
            <input className="form-input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Monthly report */}
      <div className="form-section">
        <div className="form-section-title">Monthly report</div>
        <label className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
          <input type="checkbox" checked={reportEnabled} onChange={(e) => setReportEnabled(e.target.checked)} />
          Send a monthly visibility report
        </label>
        <div style={labelHalf}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Send on day of month</label>
            <input className="form-input" type="number" min={1} max={28} value={reportDay} onChange={(e) => setReportDay(Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Recipient emails</label>
            <input className="form-input" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="client@petico.my, ops@petico.my" />
          </div>
        </div>
        {mode === 'edit' && (
          <label className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', marginBottom: 0 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Client is active
          </label>
        )}
      </div>

      {/* Competitors */}
      <div className="form-section">
        <div className="form-section-title">Competitors</div>
        {competitors.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--faint)', marginBottom: 10 }}>No competitors tracked.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {competitors.map((c, i) => (
            <div key={i} className="prompt-row">
              <input className="form-input" placeholder="Name" value={c.name} onChange={(e) => updateCompetitor(i, { name: e.target.value })} />
              <input className="form-input" placeholder="Website" value={c.website} onChange={(e) => updateCompetitor(i, { website: e.target.value })} />
              <input className="form-input" placeholder="Aliases (comma-sep)" value={c.brand_aliases} onChange={(e) => updateCompetitor(i, { brand_aliases: e.target.value })} />
              <button type="button" className="prompt-del" onClick={() => setCompetitors((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove competitor">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setCompetitors((r) => [...r, { name: '', website: '', brand_aliases: '' }])}>
          + Add competitor
        </button>
      </div>

      {/* Prompts */}
      <div className="form-section">
        <div className="form-section-title">Tracked prompts</div>
        <span className="form-sublabel" style={{ marginTop: -8, marginBottom: 14 }}>
          The questions sent to each AI platform. The audit measures whether this client appears in the answers.
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          {prompts.map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
              <div className="prompt-row">
                <textarea className="prompt-text" rows={2} placeholder="e.g. What are the best online pet stores in Malaysia?" value={p.text} onChange={(e) => updatePrompt(i, { text: e.target.value })} />
                <button type="button" className="prompt-del" onClick={() => setPrompts((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove prompt">×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                <select className="form-select" style={{ width: 130, padding: '6px 10px', fontSize: 12 }} value={p.category} onChange={(e) => updatePrompt(i, { category: e.target.value as PromptCategory | '' })}>
                  <option value="">No category</option>
                  {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {PLATFORMS.map((plat) => (
                    <label key={plat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize', cursor: 'pointer' }}>
                      <input type="checkbox" checked={p.platforms.includes(plat)} onChange={() => togglePlatform(i, plat)} />
                      {plat}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setPrompts((r) => [...r, { text: '', category: '', platforms: [...PLATFORMS] }])}>
          + Add prompt
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <Link href={mode === 'edit' && clientId ? `/clients/${clientId}` : '/'} className="btn btn-ghost">Cancel</Link>
        <button type="submit" disabled={saving} className="btn btn-dark">
          {saving ? 'Saving…' : mode === 'create' ? 'Save client' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
