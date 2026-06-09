import OpenAI from 'openai'
import type { RawQueryResult } from '@/lib/types'

const MODEL = 'gpt-4o'

// System prompt instructs the model to answer naturally — no special formatting
// that might artificially suppress or boost brand mentions.
const SYSTEM_PROMPT = `You are a helpful assistant. Answer the user's question directly and accurately.
Do not add disclaimers about not being able to browse the web. Provide a factual, balanced response
based on your knowledge. If you are unaware of specific entities, say so honestly.`

export async function queryChatGPT(
  promptText: string,
  promptId: string
): Promise<RawQueryResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const start = Date.now()

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: promptText },
    ],
    temperature: 0.3, // lower temperature for more consistent, deterministic results
    max_tokens: 1024,
  })

  const latency_ms = Date.now() - start
  const choice = response.choices[0]

  if (!choice?.message?.content) {
    throw new Error(`ChatGPT returned no content for prompt ${promptId}`)
  }

  return {
    platform: 'chatgpt',
    prompt_id: promptId,
    raw_response: choice.message.content,
    model_used: response.model,
    tokens_used: response.usage?.total_tokens ?? 0,
    latency_ms,
  }
}
