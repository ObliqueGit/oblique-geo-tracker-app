import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ClientForm from '@/app/components/ClientForm'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="topnav">
        <div className="nav-left">
          <div className="nav-logo" />
          <Link href="/" className="nav-dim">Dashboard</Link>
          <span className="nav-sep">/</span>
          <span style={{ fontWeight: 500 }}>Add client</span>
        </div>
      </div>

      <div className="main" style={{ maxWidth: 720, padding: '36px 28px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Add a client</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Set up the brand, competitors, and the prompts to track across ChatGPT, Gemini, and Claude.
          </div>
        </div>
        <ClientForm mode="create" />
      </div>
    </div>
  )
}
