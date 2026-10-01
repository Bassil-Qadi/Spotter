import type { DailyLog, LogDetails, Status, Stop } from '../types'
import { clock, shortPlace } from '../format'

interface Props {
  log: DailyLog
  date: Date
  from: string
  to: string
  stops: Stop[]
  details: LogDetails
}

const W = 1000
const GX0 = 150
const GX1 = 850
const HOUR_W = (GX1 - GX0) / 24
const GY = 318
const ROW_H = 36
const ROWS: { status: Status; label: string }[] = [
  { status: 'OFF', label: '1. Off Duty' },
  { status: 'SB', label: '2. Sleeper Berth' },
  { status: 'D', label: '3. Driving' },
  { status: 'ON', label: '4. On Duty (not driving)' },
]
const INK = '#0f172a'
const LINE = '#1e3a8a'
const GRID = '#475569'

const xOf = (min: number) => GX0 + (min / 60) * HOUR_W
const yOf = (s: Status) => GY + ROWS.findIndex((r) => r.status === s) * ROW_H + ROW_H / 2

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export default function LogSheet({ log, date, from, to, stops, details }: Props) {
  const hourLabels = ['Mid-\nnight', ...Array.from({ length: 11 }, (_, i) => String(i + 1)), 'Noon',
    ...Array.from({ length: 11 }, (_, i) => String(i + 1)), 'Mid-\nnight']

  // single polyline through every duty change
  let path = ''
  log.entries.forEach((e, i) => {
    const y = yOf(e.status)
    path += i === 0 ? `M${xOf(e.start)},${y}` : `L${xOf(e.start)},${y}`
    path += `L${xOf(e.end)},${y}`
  })

  const dayStart = (log.day - 1) * 1440
  const remarks = log.remarks.map((r) => {
    const stop = stops.find((s) => s.start - dayStart === r.minute && s.label === r.label)
    const where = stop ? (stop.name ? shortPlace(stop.name) : `mile ${Math.round(stop.mile)}`) : ''
    return `${clock(r.minute)} – ${r.label}${where ? ` · ${where}` : ''}`
  })
  const colA = remarks.slice(0, 9)
  const colB = remarks.slice(9, 18)

  const totalsY = GY + ROWS.length * ROW_H
  const t = log.totals_hours
  const rec = log.recap

  return (
    <svg
      className="sheet"
      viewBox={`0 0 ${W} 1130`}
      role="img"
      aria-label={`Driver's daily log, day ${log.day}`}
      fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
      fill={INK}
    >
      <rect x="1" y="1" width={W - 2} height="1128" fill="#fff" stroke="#cbd5e1" />

      {/* header */}
      <text x="40" y="58" fontSize="30" fontWeight="800">Drivers Daily Log</text>
      <text x="40" y="78" fontSize="12" fill="#475569">(24 hours)</text>

      {[
        { x: 330, v: String(date.getMonth() + 1).padStart(2, '0'), c: '(month)' },
        { x: 440, v: String(date.getDate()).padStart(2, '0'), c: '(day)' },
        { x: 550, v: String(date.getFullYear()), c: '(year)' },
      ].map((f, i) => (
        <g key={i}>
          <text x={f.x + 45} y="58" fontSize="18" fontWeight="700" textAnchor="middle">{f.v}</text>
          <line x1={f.x} x2={f.x + 90} y1="64" y2="64" stroke={INK} />
          <text x={f.x + 45} y="78" fontSize="10" textAnchor="middle" fill="#475569">{f.c}</text>
          {i < 2 && <text x={f.x + 100} y="62" fontSize="16">/</text>}
        </g>
      ))}
      <text x="700" y="48" fontSize="10.5">Original – File at home terminal.</text>
      <text x="700" y="63" fontSize="10.5">Duplicate – Driver retains in his/her</text>
      <text x="700" y="77" fontSize="10.5">possession for 8 days.</text>

      <text x="40" y="118" fontSize="14" fontWeight="700">From:</text>
      <text x="90" y="118" fontSize="14">{trunc(from, 34)}</text>
      <line x1="85" x2="470" y1="124" y2="124" stroke={INK} />
      <text x="520" y="118" fontSize="14" fontWeight="700">To:</text>
      <text x="550" y="118" fontSize="14">{trunc(to, 34)}</text>
      <line x1="545" x2="960" y1="124" y2="124" stroke={INK} />

      {/* mileage boxes */}
      {[
        { x: 40, v: Math.round(log.miles), c: 'Total Miles Driving Today' },
        { x: 215, v: Math.round(log.miles), c: 'Total Mileage Today' },
      ].map((b) => (
        <g key={b.c}>
          <rect x={b.x} y="146" width="160" height="52" fill="#f8fafc" stroke={INK} />
          <text x={b.x + 80} y="180" fontSize="24" fontWeight="800" textAnchor="middle">{b.v}</text>
          <text x={b.x + 80} y="214" fontSize="11" textAnchor="middle">{b.c}</text>
        </g>
      ))}
      <text x="44" y="245" fontSize="13">{trunc(details.vehicle, 52)}</text>
      <line x1="40" x2="470" y1="250" y2="250" stroke={INK} />
      <text x="255" y="266" fontSize="11" textAnchor="middle">
        Truck/Tractor and Trailer Numbers or License Plate(s)/State (show each unit)
      </text>

      {[
        { y: 170, c: 'Name of Carrier or Carriers', v: details.carrier },
        { y: 212, c: 'Main Office Address', v: details.mainOffice },
        { y: 254, c: 'Home Terminal Address', v: details.homeTerminal },
      ].map((l) => (
        <g key={l.c}>
          <text x="524" y={l.y - 5} fontSize="13">{trunc(l.v, 54)}</text>
          <line x1="520" x2="960" y1={l.y} y2={l.y} stroke={INK} />
          <text x="740" y={l.y + 15} fontSize="11" textAnchor="middle">{l.c}</text>
        </g>
      ))}

      {/* graph grid */}
      {hourLabels.map((lab, i) => {
        const x = GX0 + i * HOUR_W
        const lines = lab.split('\n')
        return lines.map((ln, j) => (
          <text key={`${i}-${j}`} x={x} y={GY - 12 + j * 11 - (lines.length - 1) * 11} fontSize="10" fontWeight="600" textAnchor="middle">{ln}</text>
        ))
      })}
      <text x={GX1 + 50} y={GY - 14} fontSize="10" fontWeight="600" textAnchor="middle">Total</text>
      <text x={GX1 + 50} y={GY - 4} fontSize="10" fontWeight="600" textAnchor="middle">Hours</text>

      <rect x={GX0} y={GY} width={GX1 - GX0} height={ROW_H * 4} fill="#f8fafc" stroke={INK} strokeWidth="1.5" />
      {ROWS.map((r, i) => (
        <g key={r.status}>
          <line x1={GX0} x2={GX1} y1={GY + i * ROW_H} y2={GY + i * ROW_H} stroke={INK} />
          <text x={GX0 - 10} y={GY + i * ROW_H + ROW_H / 2 + 4} fontSize="12" fontWeight="600" textAnchor="end">
            {r.status === 'ON' ? (
              <>
                <tspan x={GX0 - 10} dy="-5">4. On Duty</tspan>
                <tspan x={GX0 - 10} dy="13" fontSize="10" fontWeight="500">(not driving)</tspan>
              </>
            ) : (
              r.label
            )}
          </text>
          {/* total hours */}
          <line x1={GX1 + 14} x2={GX1 + 88} y1={GY + i * ROW_H + ROW_H - 6} y2={GY + i * ROW_H + ROW_H - 6} stroke={INK} />
          <text x={GX1 + 82} y={GY + i * ROW_H + ROW_H - 10} fontSize="13" fontWeight="700" textAnchor="end">
            {t[r.status].toFixed(2)}
          </text>
          {/* quarter-hour ticks */}
          {Array.from({ length: 96 }, (_, q) => {
            if (q % 4 === 0) return null
            const x = GX0 + (q / 4) * HOUR_W
            const h = q % 2 === 0 ? 14 : 8
            return <line key={q} x1={x} x2={x} y1={GY + i * ROW_H} y2={GY + i * ROW_H + h} stroke={GRID} strokeWidth="0.8" />
          })}
        </g>
      ))}
      {Array.from({ length: 25 }, (_, h) => (
        <line key={h} x1={GX0 + h * HOUR_W} x2={GX0 + h * HOUR_W} y1={GY} y2={GY + ROW_H * 4} stroke={GRID} strokeWidth="1" />
      ))}
      <text x={GX1 + 82} y={totalsY + 20} fontSize="13" fontWeight="800" textAnchor="end">
        {(t.OFF + t.SB + t.D + t.ON).toFixed(2)}
      </text>
      <path d={path} fill="none" stroke={LINE} strokeWidth="3" strokeLinejoin="miter" />

      {/* remarks and below, shifted under the grid */}
      <g transform="translate(0,120)">
      <text x="40" y="378" fontSize="15" fontWeight="800">Remarks</text>
      <rect x="40" y="388" width="920" height="214" fill="#fff" stroke={INK} />
      {colA.map((r, i) => (
        <text key={i} x="52" y={412 + i * 22} fontSize="12">{trunc(r, 62)}</text>
      ))}
      {colB.map((r, i) => (
        <text key={i} x="512" y={412 + i * 22} fontSize="12">{trunc(r, 62)}</text>
      ))}
      <text x="500" y="622" fontSize="11" textAnchor="middle" fill="#475569">
        Enter name of place you reported and where released from work and when and where each change of duty occurred. Use time standard of home terminal.
      </text>

      {/* shipping documents */}
      <text x="40" y="660" fontSize="13" fontWeight="700">Shipping Documents:</text>
      <text x="44" y="686" fontSize="13">{trunc(details.manifest, 52)}</text>
      <line x1="40" x2="470" y1="692" y2="692" stroke={INK} />
      <text x="40" y="708" fontSize="11">DVL or Manifest No. or</text>
      <text x="44" y="736" fontSize="13">{trunc(details.shipper, 52)}</text>
      <line x1="40" x2="470" y1="742" y2="742" stroke={INK} />
      <text x="40" y="758" fontSize="11">Shipper &amp; Commodity</text>

      {/* recap */}
      <line x1="40" x2="960" y1="790" y2="790" stroke={INK} strokeWidth="2" />
      <text x="40" y="812" fontSize="13" fontWeight="800">Recap:</text>
      <text x="40" y="828" fontSize="11">Complete at end of day</text>

      <g transform="translate(180,796)">
        <rect x="0" y="0" width="150" height="190" fill="#f8fafc" stroke={INK} />
        <text x="75" y="22" fontSize="11" textAnchor="middle" fontWeight="700">On duty hours today,</text>
        <text x="75" y="36" fontSize="11" textAnchor="middle" fontWeight="700">Total lines 3 &amp; 4</text>
        <text x="75" y="120" fontSize="30" fontWeight="800" textAnchor="middle">{rec.on_duty_today.toFixed(2)}</text>
        <text x="75" y="140" fontSize="10" textAnchor="middle" fill="#475569">hours</text>
      </g>
      <text x="350" y="816" fontSize="12" fontWeight="800">70 Hour / 8 Day Drivers</text>
      {[
        { x: 350, k: 'A.', t1: 'Total hours on', t2: 'duty last 8 days', t3: 'including today.', v: rec.cycle_total.toFixed(2) },
        { x: 500, k: 'B.', t1: 'Total hours', t2: 'available tomorrow', t3: '70 hr. minus A*', v: rec.cycle_available.toFixed(2) },
        { x: 650, k: 'C.', t1: 'Total hours on', t2: 'duty last 5 days', t3: 'including today.', v: '—' },
      ].map((c) => (
        <g key={c.k} transform={`translate(${c.x},826)`}>
          <rect x="0" y="0" width="140" height="160" fill="#f8fafc" stroke={INK} />
          <text x="8" y="20" fontSize="12" fontWeight="800">{c.k}</text>
          <text x="8" y="38" fontSize="11">{c.t1}</text>
          <text x="8" y="52" fontSize="11">{c.t2}</text>
          <text x="8" y="66" fontSize="11">{c.t3}</text>
          <text x="70" y="124" fontSize="28" fontWeight="800" textAnchor="middle">{c.v}</text>
        </g>
      ))}
      <text x="810" y="840" fontSize="10">*If you took 34</text>
      <text x="810" y="853" fontSize="10">consecutive hours</text>
      <text x="810" y="866" fontSize="10">off duty you have</text>
      <text x="810" y="879" fontSize="10">60/70 hours</text>
      <text x="810" y="892" fontSize="10">available</text>
      <text x="40" y="1000" fontSize="10" fill="#64748b">Generated by Spotter · Day {log.day} · {date.toLocaleDateString()}</text>
      </g>
    </svg>
  )
}
