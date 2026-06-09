import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runAudit } from '@/lib/audit-engine'

export async function POST(request: NextRequest) {
  // Auth check — must be logged-in staff
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await request.json()
  const { client_id } = body

  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  // Verify client exists and is active
  const db = createServiceClient()
  const { data: client, error: clientErr } = await db
    .from('clients')
    .select('id, name, is_active')
    .eq('id', client_id)
    .single()

  if (clientErr || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  if (!client.is_active) {
    return NextResponse.json({ error: 'Client is not active' }, { status: 400 })
  }

  // Block if there's already a running audit for this client
  const { data: running } = await db
    .from('audits')
    .select('id')
    .eq('client_id', client_id)
    .in('status', ['pending', 'running'])
    .limit(1)
    .single()

  if (running) {
    return NextResponse.json(
      { error: 'An audit is already running for this client', audit_id: running.id },
      { status: 409 }
    )
  }

  // Create audit record
  const { data: audit, error: createErr } = await db
    .from('audits')
    .insert({
      client_id,
      triggered_by: user.id,
      trigger_type: 'manual',
      status: 'pending',
    })
    .select()
    .single()

  if (createErr || !audit) {
    return NextResponse.json({ error: 'Failed to create audit' }, { status: 500 })
  }

  // Fire-and-forget — run audit asynchronously so the response returns immediately.
  // The client polls /api/audit/[id]/status for progress.
  // In production, replace this with a queue (e.g. Vercel Queue, Inngest, or Upstash)
  // to avoid Vercel's 60s serverless timeout on large prompt sets.
  runAudit(audit.id).catch((err) => {
    console.error(`[audit:${audit.id}] Unhandled error:`, err)
  })

  return NextResponse.json({ audit_id: audit.id, status: 'pending' }, { status: 202 })
}
