export type Status = 'OFF' | 'SB' | 'D' | 'ON'

export interface TripInput {
  current_location: string
  pickup_location: string
  dropoff_location: string
  cycle_used_hours: number
  start_hour: number
}

export interface Place {
  query: string
  name: string
  lat: number
  lng: number
}

export interface Stop {
  type: 'start' | 'pickup' | 'dropoff' | 'fuel' | 'break' | 'rest' | 'restart'
  label: string
  name: string
  lat: number
  lng: number
  start: number // minutes since day-1 00:00
  end: number
  mile: number
}

export interface LogEntry {
  status: Status
  start: number // minutes since that day's 00:00
  end: number
  label: string
  kind: string
}

export interface DailyLog {
  day: number
  entries: LogEntry[]
  events: LogEntry[]
  remarks: { minute: number; label: string; status: Status }[]
  totals_hours: Record<Status, number>
  miles: number
  recap: { on_duty_today: number; cycle_total: number; cycle_available: number }
}

export interface TripPlan {
  inputs: { cycle_used_hours: number; start_hour: number }
  places: Place[]
  route: { geometry: [number, number][]; total_miles: number }
  stops: Stop[]
  logs: DailyLog[]
  summary: { total_miles: number; total_days: number; driving_hours: number; end_minute: number }
}

export interface ApiErrors {
  errors: Record<string, string>
}
