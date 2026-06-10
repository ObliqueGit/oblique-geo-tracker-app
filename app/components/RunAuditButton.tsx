'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  clientId: string
  variant?: 'solid' | 'blue'
}

/**
 * Triggers an audit run for a client, then polls the status endpoint until the
 * audit completes (or fails) and refreshes the page so fresh scores render.
 */
export default function RunAuditButton({ clientId, variant = 'solid' }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  async function start() {
    setState('starting')
    setMessage(null)
    try {
      const res = await fetch('/api/audit/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setState('error')
        setMessage(data.error ?? 'Failed to start audit')
        return
      }
      setState('running')
      poll(data.audit_id)
    } catch {
      setState('error')
      setMessage('Network error')
    }
  }

  function poll(auditId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit/${auditId}/status`)
        const data = await res.json()
        setProgress(data.progress ?? 0)
        if (data.status === 'complete') {
          clearInterval(interval)
          setState('idle')
          setProgress(0)
          router.refresh()
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setState('error')
          setMessage(data.error_message ?? 'Audit failed')
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2000)
  }

  const busy = state === 'starting' || state === 'running'

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <button onClick={start} disabled={busy} className={`btn ${variant === 'blue' ? 'btn-blue' : 'btn-dark'}`}>
        {state === 'starting' ? 'Starting…' : state === 'running' ? `Running ${progress}%` : 'Run audit'}
      </button>
      {state === 'error' && message && (
        <span style={{ fontSize: 10, color: 'var(--danger)', maxWidth: 180, textAlign: 'right' }}>{message}</span>
      )}
    </span>
  )
}
