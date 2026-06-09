import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ClientForm, { type ClientFormInitial } from '@/app/components/ClientForm'
import type { Client, Competitor, Prompt } from '@/lib/types'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single()
  if (!client) notFound()

  const { data: competitors } = await supabase
    .from('competitors')
    .select('*')
    .eq('client_id', id)
    .order('name')

  const { data: prompts } = await supabase
    .from('prompts')
    .select('*')
    .eq('client_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const c = client as Client

  const initial: ClientFormInitial = {
    name: c.name,
    website: c.website,
    industry: c.industry ?? '',
    contact_name: c.contact_name ?? '',
    contact_email: c.contact_email ?? '',
    brand_aliases: c.brand_aliases ?? [],
    target_keywords: c.target_keywords ?? [],
    monthly_report_enabled: c.monthly_report_enabled,
    report_day: c.report_day,
    report_recipient_emails: c.report_recipient_emails ?? [],
    is_active: c.is_active,
    competitors: (competitors as Competitor[] | null ?? []).map((comp) => ({
      name: comp.name,
      website: comp.website,
      brand_aliases: comp.brand_aliases ?? [],
    })),
    prompts: (prompts as Prompt[] | null ?? []).map((p) => ({
      text: p.text,
      category: p.category,
      platforms: p.platforms,
    })),
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-2 text-sm">
          <Link href="/" className="text-gray-400 hover:text-gray-700 transition-colors">Dashboard</Link>
          <span className="text-gray-200">/</span>
          <Link href={`/clients/${id}`} className="text-gray-400 hover:text-gray-700 transition-colors">{c.name}</Link>
          <span className="text-gray-200">/</span>
          <span className="text-gray-900 font-medium">Edit</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Edit {c.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Update brand details, competitors, and tracked prompts.</p>
        </div>
        <ClientForm mode="edit" clientId={id} initial={initial} />
      </main>
    </div>
  )
}
