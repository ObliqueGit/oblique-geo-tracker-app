import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ClientForm from '@/app/components/ClientForm'

export default async function NewClientPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-2 text-sm">
          <Link href="/" className="text-gray-400 hover:text-gray-700 transition-colors">Dashboard</Link>
          <span className="text-gray-200">/</span>
          <span className="text-gray-900 font-medium">New client</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Add a client</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up the brand, competitors, and the prompts to track across ChatGPT, Gemini, and Claude.
          </p>
        </div>
        <ClientForm mode="create" />
      </main>
    </div>
  )
}
