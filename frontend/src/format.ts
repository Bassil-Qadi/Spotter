export function clock(minuteOfDay: number): string {
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${mm} ${suffix}`
}

export function hours(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return mm ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${hh}h`
}

export function duration(minutes: number): string {
  return hours(minutes / 60)
}

export function addDays(iso: string, days: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Chicago, Cook County, Illinois, United States" -> "Chicago, Illinois" */
export function shortPlace(name: string): string {
  const parts = name.split(',').map((s) => s.trim())
  if (parts.length <= 2) return name
  return `${parts[0]}, ${parts[parts.length - 2]}`
}
