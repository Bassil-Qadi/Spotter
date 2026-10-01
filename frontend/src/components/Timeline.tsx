import type { TripPlan } from '../types'
import { addDays, clock, duration, shortDate, shortPlace } from '../format'
import { STOP_META } from './RouteMap'

export default function Timeline({ plan, startDate }: { plan: TripPlan; startDate: string }) {
  const days = new Map<number, typeof plan.stops>()
  for (const s of plan.stops) {
    const d = Math.floor(s.start / 1440)
    days.set(d, [...(days.get(d) ?? []), s])
  }
  return (
    <div className="timeline">
      {[...days.entries()].map(([d, stops]) => (
        <section key={d}>
          <h4>
            Day {d + 1} <span className="muted">· {shortDate(addDays(startDate, d))}</span>
          </h4>
          <ul>
            {stops.map((s, i) => (
              <li key={i}>
                <span className="pin sm" style={{ background: STOP_META[s.type].color }}>
                  {STOP_META[s.type].glyph}
                </span>
                <div>
                  <b>{s.label}</b>
                  {s.name && <span className="muted"> · {shortPlace(s.name)}</span>}
                  <div className="muted small">
                    {clock(s.start)}
                    {s.end > s.start && <> – {clock(s.end)} ({duration(s.end - s.start)})</>} · mile{' '}
                    {Math.round(s.mile)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
