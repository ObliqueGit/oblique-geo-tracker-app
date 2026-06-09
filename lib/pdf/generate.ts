/**
 * PDF report generator using Playwright headless Chromium.
 * Run this as a separate script or from a long-running worker,
 * NOT inside a Vercel serverless function (60s timeout too short for heavy reports).
 *
 * Usage: ts-node lib/pdf/generate.ts <report_id>
 */

import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { createServiceClient } from '@/lib/supabase/server'

export async function generateReportPDF(reportId: string): Promise<string> {
  const db = createServiceClient()

  const { data: report } = await db
    .from('reports')
    .select('*, clients(*), audits(*)')
    .eq('id', reportId)
    .single()

  if (!report) throw new Error(`Report ${reportId} not found`)

  const client = report.clients as any
  const { data: scores } = await db
    .from('visibility_scores')
    .select('*')
    .eq('audit_id', report.audit_id)

  const html = buildReportHTML(client, report, scores ?? [])

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.setContent(html, { waitUntil: 'networkidle' })

  const fullHeight = await page.evaluate(() => document.body.scrollHeight)
  const widthMm = 381.0
  const heightMm = parseFloat((fullHeight * 0.2646).toFixed(1))

  const outputPath = path.join(process.cwd(), 'tmp', `report-${reportId}.pdf`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  await page.pdf({
    path: outputPath,
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  })

  await browser.close()

  // Upload to Supabase Storage
  const fileBuffer = fs.readFileSync(outputPath)
  const storagePath = `reports/${client.id}/${reportId}.pdf`

  const { error: uploadErr } = await db.storage
    .from('geo-reports')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

  // Update report record with storage path
  await db.from('reports').update({ pdf_path: storagePath }).eq('id', reportId)

  fs.unlinkSync(outputPath)
  return storagePath
}

function buildReportHTML(client: any, report: any, scores: any[]): string {
  const overall = scores.find((s) => s.platform === 'overall')
  const platforms = scores.filter((s) => s.platform !== 'overall')
  const reportDate = new Date(report.report_month).toLocaleString('en-MY', {
    month: 'long', year: 'numeric',
  })

  const platformRows = platforms.map((s) => `
    <tr>
      <td>${s.platform.charAt(0).toUpperCase() + s.platform.slice(1)}</td>
      <td><strong>${s.score.toFixed(1)}%</strong></td>
      <td>${s.mentions_count} / ${s.total_prompts}</td>
      <td>${s.avg_rank ? `#${s.avg_rank.toFixed(1)}` : '—'}</td>
    </tr>
  `).join('')

  const summaryHtml = (report.ai_summary ?? '')
    .split('\n\n')
    .filter(Boolean)
    .map((p: string) => `<p>${p}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a1a; }
  .header { background: #1a1a1a; color: #fff; padding: 48px 64px; }
  .header h1 { font-size: 28px; font-weight: 700; margin-top: 8px; }
  .header p { color: #888; font-size: 13px; margin-top: 4px; }
  .body { padding: 48px 64px; }
  .score-hero { background: #f9f9f9; border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px; }
  .score-hero .pct { font-size: 72px; font-weight: 800; color: #1a1a1a; line-height: 1; }
  .score-hero .label { font-size: 13px; color: #888; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  th { text-align: left; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #f1f1f1; padding: 8px 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #f5f5f5; font-size: 14px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
  p { font-size: 14px; color: #444; line-height: 1.8; margin-bottom: 12px; }
  .disclaimer { font-size: 11px; color: #aaa; border-top: 1px solid #f1f1f1; padding-top: 24px; margin-top: 24px; line-height: 1.6; }
  .agency { font-size: 11px; color: #888; margin-top: 4px; }
</style>
</head>
<body>
<div class="header">
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666">Oblique GEO Tracker</p>
  <h1>${client.name}</h1>
  <p>AI Visibility Report — ${reportDate}</p>
</div>
<div class="body">
  <div class="score-hero">
    <div class="pct">${overall?.score?.toFixed(1) ?? '—'}%</div>
    <div class="label">Overall AI Visibility Score &mdash; ${overall?.mentions_count ?? 0} of ${overall?.total_prompts ?? 0} tracked prompts</div>
  </div>

  <table>
    <tr><th>Platform</th><th>Visibility Score</th><th>Prompts Matched</th><th>Avg Rank</th></tr>
    ${platformRows}
  </table>

  <h2>Strategic Summary</h2>
  ${summaryHtml}

  <p class="disclaimer">Visibility scores reflect the percentage of tracked prompts in which ${client.name}'s brand appeared in responses from ChatGPT, Google Gemini, and Perplexity. Scores are approximate indicators derived from live API calls — AI models are non-deterministic and results may vary between runs. No data in this report is fabricated or estimated.</p>
  <p class="agency">Prepared by Oblique · oblique.agency</p>
</div>
</body>
</html>`
}
