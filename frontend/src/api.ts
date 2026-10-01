import type { TripInput, TripPlan } from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export class ApiError extends Error {
  fields: Record<string, string>
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.fields = fields
  }
}

export async function planTrip(input: TripInput): Promise<TripPlan> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api/plan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new ApiError('Could not reach the server. Please check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const errors: Record<string, string> = data?.errors ?? {}
    throw new ApiError(errors.detail ?? 'Please check the highlighted fields.', errors)
  }
  return data as TripPlan
}
