import { useState, useEffect, useCallback, useRef } from 'react'
import MapView from '../components/MapView'
import SidePanel from '../components/SidePanel'
import MapLegend from '../components/MapLegend'
import { LAYER_CONFIG } from '../data/mockData'

const API = 'http://localhost:5050'

export default function Dashboard({ onLogout }) {
  // ── API state ──────────────────────────────────────────────────────
  const [meta, setMeta]       = useState(null)   // bounds + dates from /api/meta
  const [apiError, setApiError] = useState(null) // null = loading, string = error

  // ── Slider / layer state ──────────────────────────────────────────
  const [dates, setDates]         = useState([])
  const [dateIndex, setDateIndex] = useState(0)
  const [activeLayer, setActiveLayer] = useState('NDVI')
  const [selectedZone, setSelectedZone] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playInterval = useRef(null)

  // ── Fetch meta from API ───────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/meta`)
      .then(r => {
        if (!r.ok) throw new Error(`API returned ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then(data => {
        setMeta(data)
        setDates(data.dates || [])
        // Default to last date (latest imagery)
        if (data.dates && data.dates.length > 0) {
          setDateIndex(data.dates.length - 1)
        }
        setApiError(null)
      })
      .catch(err => {
        // API not reachable — fall back to mockData dates, show warning
        setApiError(err.message)
        // Import fallback dates from mockData so the slider still works
        import('../data/mockData').then(m => {
          setDates(m.DATES)
          setDateIndex(m.DATES.length - 1)
        })
      })
  }, [])

  // ── Animate through dates ─────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      clearInterval(playInterval.current)
      setIsPlaying(false)
    } else {
      setIsPlaying(true)
      setDateIndex(prev => (prev >= dates.length - 1 ? 0 : prev))
      playInterval.current = setInterval(() => {
        setDateIndex(prev => {
          if (prev >= dates.length - 1) {
            clearInterval(playInterval.current)
            setIsPlaying(false)
            return dates.length - 1
          }
          return prev + 1
        })
      }, 1200)
    }
  }, [isPlaying, dates.length])

  useEffect(() => {
    return () => { if (playInterval.current) clearInterval(playInterval.current) }
  }, [])

  const handleZoneSelect = useCallback(zoneId => setSelectedZone(zoneId), [])

  const layerConfig = LAYER_CONFIG[activeLayer]

  return (
    <div className="dashboard">
      {/* API Warning Banner */}
      {apiError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9998,
          background: 'rgba(251,113,133,0.15)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(251,113,133,0.3)',
          padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center',
          gap: '0.75rem', fontSize: '0.8rem', color: '#fb7185',
        }}>
          <span>⚠️</span>
          <span>
            <strong>API not reachable.</strong> Showing simulated data.
            Run the pipeline then start: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 4 }}>python api/app.py</code>
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
            {apiError}
          </span>
        </div>
      )}

      <div className="map-container" style={apiError ? { marginTop: '2rem' } : {}}>
        <MapView
          dateIndex={dateIndex}
          activeLayer={activeLayer}
          selectedZone={selectedZone}
          onZoneSelect={handleZoneSelect}
          meta={meta}
          apiBase={API}
          apiError={!!apiError}
        />
        <MapLegend layerConfig={layerConfig} />
      </div>

      <SidePanel
        dateIndex={dateIndex}
        setDateIndex={setDateIndex}
        activeLayer={activeLayer}
        setActiveLayer={setActiveLayer}
        selectedZone={selectedZone}
        onZoneSelect={handleZoneSelect}
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        onLogout={onLogout}
        dates={dates}
        apiBase={API}
        apiError={!!apiError}
      />
    </div>
  )
}
