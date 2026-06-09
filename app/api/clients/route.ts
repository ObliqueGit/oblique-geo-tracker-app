import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { replaceCompetitors, replacePrompts, type ClientPayload } from '@/lib/clients'

// POST /api/clients — create a new client with optional competitors + prompts
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = (await request.json()) as ClientPayload

  if (!body.name?.trim() || !body.website?.trim()) {
    return NextResponse.json({ error: 'Name and website are required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: client, error: clientErr } = await db
    .from('clients')
    .insert({
      name: body.name.trim(),
      website: body.website.trim(),
      industry: body.industry?.trim() || null,
      contact_name: body.contact_name?.trim() || null,
      contact_email: body.contact_email?.trim() || null,
      brand_aliases: body.brand_aliases ?? [],
      target_keywords: body.target_keywords ?? [],
      monthly_report_enabled: body.monthly_report_enabled ?? true,
      report_day: body.report_day ?? 1,
      report_recipient_emails: body.report_recipient_emails ?? [],
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (clientErr || !client) {
    return NextResponse.json({ error: clientErr?.message ?? 'Failed to create client' }, { status: 500 })
  }

  await replaceCompetitors(db, client.id, body.competitors ?? [])
  await replacePrompts(db, client.id, body.prompts ?? [])

  return NextResponse.json({ id: client.id }, { status: 201 })
}
