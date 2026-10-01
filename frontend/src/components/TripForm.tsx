import { useState } from 'react'
import type { FormEvent } from 'react'
import type { LogDetails, TripInput } from '../types'
import { todayISO } from '../format'

interface Props {
  loading: boolean
  fieldErrors: Record<string, string>
  details: LogDetails
  onDetailsChange: (d: LogDetails) => void
  onSubmit: (input: TripInput, startDate: string) => void
}

const DETAIL_FIELDS: { key: keyof LogDetails; label: string; placeholder: string }[] = [
  { key: 'carrier', label: 'Name of carrier', placeholder: 'e.g. Acme Freight Inc.' },
  { key: 'mainOffice', label: 'Main office address', placeholder: 'e.g. 100 Main St, Dallas, TX' },
  { key: 'homeTerminal', label: 'Home terminal address', placeholder: 'e.g. 55 Depot Rd, Chicago, IL' },
  { key: 'vehicle', label: 'Truck / trailer no. or plates', placeholder: 'e.g. Truck 214 · Trailer 7781 · IL ABC123' },
  { key: 'manifest', label: 'DVL or manifest no.', placeholder: 'e.g. BOL 458213' },
  { key: 'shipper', label: 'Shipper & commodity', placeholder: 'e.g. Acme Foods – packaged goods' },
]

const EXAMPLE = {
  current: 'Chicago, IL',
  pickup: 'St. Louis, MO',
  dropoff: 'Los Angeles, CA',
  cycle: '30',
}

export default function TripForm({ loading, fieldErrors, details, onDetailsChange, onSubmit }: Props) {
  const [current, setCurrent] = useState('')
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [cycle, setCycle] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [startHour, setStartHour] = useState('8')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(
      {
        current_location: current,
        pickup_location: pickup,
        dropoff_location: dropoff,
        cycle_used_hours: Number(cycle),
        start_hour: Number(startHour),
      },
      startDate,
    )
  }

  function fillExample() {
    setCurrent(EXAMPLE.current)
    setPickup(EXAMPLE.pickup)
    setDropoff(EXAMPLE.dropoff)
    setCycle(EXAMPLE.cycle)
  }

  const cycleNum = Number(cycle)
  const cyclePct = cycle === '' || Number.isNaN(cycleNum) ? 0 : Math.min(100, (cycleNum / 70) * 100)

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Plan a trip</h2>
        <button type="button" className="link" onClick={fillExample}>
          Use example
        </button>
      </div>

      <ol className="route-fields">
        <Field
          id="current"
          label="Current location"
          dot="dot-start"
          value={current}
          onChange={setCurrent}
          placeholder="e.g. Chicago, IL"
          error={fieldErrors.current_location}
        />
        <Field
          id="pickup"
          label="Pickup location"
          dot="dot-pickup"
          value={pickup}
          onChange={setPickup}
          placeholder="e.g. St. Louis, MO"
          error={fieldErrors.pickup_location}
        />
        <Field
          id="dropoff"
          label="Dropoff location"
          dot="dot-dropoff"
          value={dropoff}
          onChange={setDropoff}
          placeholder="e.g. Los Angeles, CA"
          error={fieldErrors.dropoff_location}
        />
      </ol>

      <div className="field">
        <label htmlFor="cycle">
          Current cycle used <span className="muted">(hours of 70)</span>
        </label>
        <input
          id="cycle"
          type="number"
          min={0}
          max={70}
          step={0.25}
          inputMode="decimal"
          value={cycle}
          onChange={(e) => setCycle(e.target.value)}
          placeholder="0 – 70"
          aria-invalid={!!fieldErrors.cycle_used_hours}
        />
        <div className="meter" aria-hidden>
          <span style={{ width: `${cyclePct}%` }} />
        </div>
        {fieldErrors.cycle_used_hours && <p className="err">{fieldErrors.cycle_used_hours}</p>}
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="date">Start date</label>
          <input id="date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="hour">Start time</label>
          <select id="hour" value={startHour} onChange={(e) => setStartHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      <details className="optional">
        <summary>Log sheet details <span className="muted">(optional)</span></summary>
        <div className="optional-fields">
          {DETAIL_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`d-${f.key}`}>{f.label}</label>
              <input
                id={`d-${f.key}`}
                type="text"
                value={details[f.key]}
                maxLength={80}
                placeholder={f.placeholder}
                onChange={(e) => onDetailsChange({ ...details, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <p className="hint left">Printed on every log sheet. Edits apply instantly, no need to re-plan.</p>
        </div>
      </details>

      <button className="primary" type="submit" disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" /> Planning route…
          </>
        ) : (
          'Plan trip & generate logs'
        )}
      </button>
      <p className="hint">70 hr / 8 day property-carrying driver · 1 hr pickup · 1 hr dropoff · fuel every 1,000 mi</p>
    </form>
  )
}

function Field(props: {
  id: string
  label: string
  dot: string
  value: string
  placeholder: string
  error?: string
  onChange: (v: string) => void
}) {
  return (
    <li className="field route-field">
      <span className={`dot ${props.dot}`} aria-hidden />
      <div>
        <label htmlFor={props.id}>{props.label}</label>
        <input
          id={props.id}
          type="text"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          aria-invalid={!!props.error}
          autoComplete="off"
        />
        {props.error && <p className="err">{props.error}</p>}
      </div>
    </li>
  )
}
