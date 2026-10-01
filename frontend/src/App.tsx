import { useEffect, useState } from 'react'
import './App.css'
import { ApiError, planTrip } from './api'
import { EMPTY_DETAILS } from './types'
import type { LogDetails, TripInput, TripPlan } from './types'
import { addDays, duration, hours, shortDate, shortPlace } from './format'
import TripForm from './components/TripForm'
import RouteMap from './components/RouteMap'
import Timeline from './components/Timeline'
import LogSheet from './components/LogSheet'

const DETAILS_KEY = 'spotter.logDetails'

function loadDetails(): LogDetails {
  try {
    return { ...EMPTY_DETAILS, ...JSON.parse(localStorage.getItem(DETAILS_KEY) ?? '{}') }
  } catch {
    return EMPTY_DETAILS
  }
}

export default function App() {
  const [details, setDetails] = useState<LogDetails>(loadDetails)
  useEffect(() => {
    try {
      localStorage.setItem(DETAILS_KEY, JSON.stringify(details))
    } catch {
      /* storage unavailable: details just won't persist */
    }
  }, [details])
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [startDate, setStartDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [activeDay, setActiveDay] = useState(1)

  async function handleSubmit(input: TripInput, date: string) {
    setLoading(true)
    setError('')
    setFieldErrors({})
    try {
      const result = await planTrip(input)
      setPlan(result)
      setStartDate(date)
      setActiveDay(1)
      requestAnimationFrame(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }))
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(e.fields)
        setError(e.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const log = plan?.logs.find((l) => l.day === activeDay)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>▲</span>
          <div>
            <h1>Spotter</h1>
            <p>Trip planner &amp; ELD log generator</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <aside className="side">
          <TripForm
            loading={loading}
            fieldErrors={fieldErrors}
            details={details}
            onDetailsChange={setDetails}
            onSubmit={handleSubmit}
          />
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
        </aside>

        <div className="content" id="results">
          {!plan ? (
            <div className="card empty">
              <div className="empty-art" aria-hidden>🚚</div>
              <h2>Your route and logs will appear here</h2>
              <p>
                Enter a trip on the left. We’ll map the route, schedule fuel stops, 30-minute breaks and 10-hour
                rests under FMCSA hours-of-service rules, and fill out a Driver’s Daily Log for every day.
              </p>
            </div>
          ) : (
            <>
              <section className="stats">
                <Stat label="Total distance" value={`${Math.round(plan.summary.total_miles).toLocaleString()} mi`} />
                <Stat label="Driving time" value={hours(plan.summary.driving_hours)} />
                <Stat label="Trip length" value={`${plan.summary.total_days} day${plan.summary.total_days > 1 ? 's' : ''}`} sub={duration(plan.summary.end_minute - plan.inputs.start_hour * 60) + ' door to door'} />
                <Stat label="Cycle after trip" value={`${plan.logs[plan.logs.length - 1].recap.cycle_total.toFixed(1)} / 70 h`} sub={`${plan.logs[plan.logs.length - 1].recap.cycle_available.toFixed(1)} h available`} />
              </section>

              <section className="card map-card">
                <div className="card-head">
                  <h2>Route</h2>
                  <Legend />
                </div>
                <RouteMap plan={plan} startDate={startDate} />
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Stops &amp; rests</h2>
                </div>
                <Timeline plan={plan} startDate={startDate} />
              </section>

              <section className="card">
                <div className="card-head logs-head">
                  <h2>Daily log sheets</h2>
                  <button className="ghost" onClick={() => window.print()}>
                    Print / Save PDF
                  </button>
                </div>
                <div className="tabs" role="tablist">
                  {plan.logs.map((l) => (
                    <button
                      key={l.day}
                      role="tab"
                      aria-selected={l.day === activeDay}
                      className={l.day === activeDay ? 'tab on' : 'tab'}
                      onClick={() => setActiveDay(l.day)}
                    >
                      Day {l.day}
                      <small>{shortDate(addDays(startDate, l.day - 1))}</small>
                    </button>
                  ))}
                </div>
                {log && (
                  <div className="sheet-wrap">
                    <LogSheet
                      log={log}
                      date={addDays(startDate, log.day - 1)}
                      from={shortPlace(plan.places[0].name)}
                      to={shortPlace(plan.places[2].name)}
                      stops={plan.stops}
                      details={details}
                    />
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  )
}

function Legend() {
  const items = [
    ['#16a34a', 'Start'],
    ['#2563eb', 'Pickup'],
    ['#d97706', 'Fuel'],
    ['#0891b2', 'Break'],
    ['#6366f1', 'Rest'],
    ['#dc2626', 'Dropoff'],
  ]
  return (
    <ul className="legend">
      {items.map(([c, l]) => (
        <li key={l}>
          <i style={{ background: c }} />
          {l}
        </li>
      ))}
    </ul>
  )
}
