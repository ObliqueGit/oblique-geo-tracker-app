'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  clientId: string
  variant?: 'subtle' | 'solid'
}

/**
 * Triggers an audit run for a client, then polls the status endpoint until the
 * audit completes (or fails) and refreshes the page so fresh scores render.
 */
export default function RunAuditButton({ clientId, variant = 'subtle' }: Props) {
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
        // transient — keep polling
      }
    }, 2000)
  }

  const busy = state === 'starting' || state === 'running'

  const base =
    variant === 'solid'
      ? 'bg-black text-white hover:bg-gray-800'
      : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={start}
        disabled={busy}
        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${base}`}
      >
        {state === 'starting'
          ? 'Starting…'
          : state === 'running'
          ? `Running ${progress}%`
          : 'Run audit'}
      </button>
      {state === 'error' && message && (
        <span className="text-[10px] text-red-500 max-w-[160px] text-right">{message}</span>
      )}
    </div>
  )
}
