import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Stop, TripPlan } from '../types'
import { addDays, clock, duration, shortDate, shortPlace } from '../format'

export const STOP_META: Record<Stop['type'], { color: string; glyph: string; title: string }> = {
  start: { color: '#16a34a', glyph: 'S', title: 'Start' },
  pickup: { color: '#2563eb', glyph: 'P', title: 'Pickup' },
  dropoff: { color: '#dc2626', glyph: 'D', title: 'Dropoff' },
  fuel: { color: '#d97706', glyph: '⛽', title: 'Fuel' },
  break: { color: '#0891b2', glyph: '☕', title: '30-min break' },
  rest: { color: '#6366f1', glyph: '☾', title: '10-hr rest' },
  restart: { color: '#7c3aed', glyph: '↻', title: '34-hr restart' },
}

function icon(type: Stop['type']) {
  const m = STOP_META[type]
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${m.color}">${m.glyph}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  })
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
  }, [map, points])
  return null
}

export function stopWhen(stop: Stop, startDate: string) {
  const day = Math.floor(stop.start / 1440)
  return `${shortDate(addDays(startDate, day))}, ${clock(stop.start)}`
}

export default function RouteMap({ plan, startDate }: { plan: TripPlan; startDate: string }) {
  return (
    <MapContainer center={[39, -96]} zoom={4} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={plan.route.geometry} pathOptions={{ color: '#1d4ed8', weight: 5, opacity: 0.85 }} />
      {plan.stops.map((s, i) => (
        <Marker key={i} position={[s.lat, s.lng]} icon={icon(s.type)}>
          <Popup>
            <strong>{s.label}</strong>
            <br />
            {s.name && <>{shortPlace(s.name)}<br /></>}
            {stopWhen(s, startDate)}
            {s.end > s.start && <> · {duration(s.end - s.start)}</>}
            <br />
            <span className="muted">Mile {Math.round(s.mile)}</span>
          </Popup>
        </Marker>
      ))}
      <Fit points={plan.route.geometry} />
    </MapContainer>
  )
}
