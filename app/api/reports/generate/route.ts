import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { Resend } from 'resend'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { audit_id } = await request.json()
  if (!audit_id) return NextResponse.json({ error: 'audit_id is required' }, { status: 400 })

  const db = createServiceClient()

  // Load audit + client + scores + results
  const { data: audit } = await db
    .from('audits')
    .select('*, clients(*)')
    .eq('id', audit_id)
    .eq('status', 'complete')
    .single()

  if (!audit) return NextResponse.json({ error: 'Completed audit not found' }, { status: 404 })

  const client = audit.clients as any

  const { data: scores } = await db
    .from('visibility_scores')
    .select('*')
    .eq('audit_id', audit_id)

  const { data: results } = await db
    .from('audit_results')
    .select('*, prompts(text, category)')
    .eq('audit_id', audit_id)

  // Create report record (status: generating)
  const reportMonth = new Date()
  reportMonth.setDate(1)
  const { data: report } = await db
    .from('reports')
    .insert({
      client_id: client.id,
      audit_id,
      report_month: reportMonth.toISOString().split('T')[0],
      status: 'generating',
    })
    .select()
    .single()

  if (!report) return NextResponse.json({ error: 'Failed to create report record' }, { status: 500 })

  // Generate AI narrative (async — response returns immediately with report_id)
  generateReportAsync(report.id, client, scores, results, db).catch(console.error)

  return NextResponse.json({ report_id: report.id, status: 'generating' }, { status: 202 })
}

async function generateReportAsync(
  reportId: string,
  client: any,
  scores: any[],
  results: any[],
  db: any
) {
  try {
    const overallScore = scores?.find((s) => s.platform === 'overall')
    const chatgptScore = scores?.find((s) => s.platform === 'chatgpt')
    const geminiScore = scores?.find((s) => s.platform === 'gemini')
    const claudeScore = scores?.find((s) => s.platform === 'claude')

    const mentionedPrompts = results
      ?.filter((r) => r.brand_mentioned)
      .map((r) => r.prompts?.text)
      .filter(Boolean)
      .slice(0, 5)

    const missedPrompts = results
      ?.filter((r) => !r.brand_mentioned)
      .map((r) => r.prompts?.text)
      .filter(Boolean)
      .slice(0, 5)

    // Ranked / outranked / absent breakdown
    const rankedCount    = results?.filter((r) => r.mention_status === 'ranked').length ?? 0
    const outrankedCount = results?.filter((r) => r.mention_status === 'outranked').length ?? 0
    const absentCount    = results?.filter((r) => r.mention_status === 'absent').length ?? 0

    // SIR
    const citedCount = results?.filter((r) => r.is_source_cited).length ?? 0
    const totalResults = results?.length ?? 1
    const sirPct = ((citedCount / totalResults) * 100).toFixed(1)

    // Hallucination flags across all results
    const allFlags = results
      ?.flatMap((r) => r.hallucination_flags ?? [])
      .slice(0, 5)

    const flagSummary = allFlags?.length
      ? allFlags.map((f: any) =>
          `- [${f.severity.toUpperCase()}] "${f.claim}" (${f.platform})`
        ).join('\n')
      : '(none detected)'

    // Top cited domains
    const domainFreq: Record<string, number> = {}
    results?.forEach((r) => {
      r.citation_urls?.forEach((d: string) => {
        domainFreq[d] = (domainFreq[d] ?? 0) + 1
      })
    })
    const topDomains = Object.entries(domainFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d, n]) => `${d} (${n}×)`)
      .join(', ') || '(none detected)'

    // GPT-4o writes the narrative summary
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a senior GEO (Generative Engine Optimisation) strategist at Oblique, a boutique
SEO/GEO agency in Malaysia. Write a professional monthly AI visibility report summary for a client.
Be specific, data-driven, and actionable. Tone: confident, strategic, clear. Length: 4–6 paragraphs.
Do not use filler phrases like "it's important to note". Do not fabricate data — only reference the
numbers provided. Be transparent that AI visibility scores are approximate measures.`,
        },
        {
          role: 'user',
          content: `Write a monthly GEO report summary for ${client.name} (${client.website}).
Industry: ${client.industry || 'Not specified'}

AI Visibility Scores (% of tracked prompts where brand appeared):
- Overall: ${overallScore?.score?.toFixed(1) ?? 'N/A'}% (${overallScore?.mentions_count ?? 0}/${overallScore?.total_prompts ?? 0} prompts)
- ChatGPT: ${chatgptScore?.score?.toFixed(1) ?? 'N/A'}%
- Google Gemini: ${geminiScore?.score?.toFixed(1) ?? 'N/A'}%
- Claude: ${claudeScore?.score?.toFixed(1) ?? 'N/A'}%

Mention breakdown across all prompts:
- Ranked (position 1–3): ${rankedCount}
- Outranked (position 4+): ${outrankedCount}
- Absent (not mentioned): ${absentCount}

Summarization Inclusion Rate (SIR): ${sirPct}% — this is the % of prompts where ${client.name}'s own domain was cited as a source by the AI (not just mentioned in the body text).

Net Sentiment Score (NSS): ${overallScore?.nss !== null && overallScore?.nss !== undefined ? overallScore.nss : 'N/A'} (scale −100 to +100)

Prompts where ${client.name} appeared:
${mentionedPrompts?.map((p: string) => `- ${p}`).join('\n') || '(none)'}

Prompts where ${client.name} was NOT found:
${missedPrompts?.map((p: string) => `- ${p}`).join('\n') || '(none)'}

Top domains cited by AI across all prompts: ${topDomains}

Potential hallucination flags (AI claims that may be inaccurate — require human verification):
${flagSummary}

Provide: (1) overall performance summary including SIR context, (2) which platforms are strongest/weakest and why,
(3) what the ranked/outranked/absent split reveals about content gaps, (4) whether hallucination flags suggest
a need for a corrective About page or structured data, (5) 3 concrete GEO recommendations for next month.`,
        },
      ],
      temperature: 0.5,
      max_tokens: 1200,
    })

    const ai_summary = summaryResponse.choices[0]?.message?.content ?? ''

    // Generate PDF via Playwright (called as a separate script/endpoint in production)
    // For now, store the text summary and mark ready — PDF generation is a separate step
    await db
      .from('reports')
      .update({ ai_summary, status: 'ready' })
      .eq('id', reportId)

    // Send email if client has recipients configured
    if (client.monthly_report_enabled && client.report_recipient_emails?.length > 0) {
      await resend.emails.send({
        from: 'Oblique GEO <reports@oblique.agency>',
        to: client.report_recipient_emails,
        subject: `AI Visibility Report — ${client.name} — ${new Date().toLocaleString('en-MY', { month: 'long', year: 'numeric' })}`,
        html: buildEmailHtml(client.name, ai_summary, scores),
      })

      await db
        .from('reports')
        .update({ status: 'sent', email_sent_at: new Date().toISOString() })
        .eq('id', reportId)
    }
  } catch (err) {
    console.error(`[report:${reportId}] Failed:`, err)
    await db.from('reports').update({ status: 'failed' }).eq('id', reportId)
  }
}

function buildEmailHtml(clientName: string, summary: string, scores: any[]): string {
  const overall = scores.find((s) => s.platform === 'overall')
  const platformRows = scores
    .filter((s) => s.platform !== 'overall')
    .map(
      (s) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;text-transform:capitalize">${s.platform}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;font-weight:600">${s.score.toFixed(1)}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f1f1;color:#888">${s.mentions_count}/${s.total_prompts} prompts</td>
    </tr>`
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa;padding:40px 0;color:#1a1a1a">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <div style="background:#1a1a1a;padding:28px 32px">
      <p style="color:#888;margin:0;font-size:13px;letter-spacing:.05em;text-transform:uppercase">Oblique GEO Tracker</p>
      <h1 style="color:#fff;margin:8px 0 0;font-size:22px;font-weight:600">${clientName} — AI Visibility Report</h1>
      <p style="color:#888;margin:6px 0 0;font-size:13px">${new Date().toLocaleString('en-MY', { month: 'long', year: 'numeric' })}</p>
    </div>
    <div style="padding:32px">
      <div style="background:#f9f9f9;border-radius:8px;padding:20px 24px;margin-bottom:28px;text-align:center">
        <p style="color:#888;margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Overall AI Visibility Score</p>
        <p style="font-size:48px;font-weight:700;margin:8px 0;color:#1a1a1a">${overall?.score?.toFixed(1) ?? '—'}%</p>
        <p style="color:#888;margin:0;font-size:13px">${overall?.mentions_count ?? 0} of ${overall?.total_prompts ?? 0} tracked prompts</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        <tr><th style="padding:8px 12px;text-align:left;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #f1f1f1">Platform</th><th style="padding:8px 12px;text-align:left;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #f1f1f1">Score</th><th style="padding:8px 12px;text-align:left;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #f1f1f1">Coverage</th></tr>
        ${platformRows}
      </table>
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px">Strategic Summary</h2>
      <div style="color:#444;line-height:1.7;font-size:14px">${summary.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>
      <hr style="border:none;border-top:1px solid #f1f1f1;margin:28px 0">
      <p style="color:#aaa;font-size:12px;line-height:1.6">AI visibility scores measure the percentage of tracked prompts in which your brand appears in responses from ChatGPT, Google Gemini, and Claude. Scores are approximate indicators, not absolute rankings, and may vary between runs due to model non-determinism.</p>
    </div>
  </div>
</body>
</html>`
}
