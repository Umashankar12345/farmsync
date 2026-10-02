import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, Settings, UserRound, Wheat, LogOut } from 'lucide-react'
import MapView from '../components/MapView'
import SidePanel from '../components/SidePanel'
import MapLegend from '../components/MapLegend'
import { LAYER_CONFIG } from '../data/layerConfig'

const API = '/api'

const PIPELINE_COMMAND = 'python run_pipeline.py'

export default function Dashboard({ onLogout }) {
  // ── API state ──────────────────────────────────────────────────────
  const [meta, setMeta]         = useState(null)   // bounds + dates from /api/meta
  const [fields, setFields]     = useState(null)   // GeoJSON from /api/fields
  const [apiState, setApiState] = useState('loading')
  const [missingFiles, setMissingFiles] = useState([])
  const [retryToken, setRetryToken] = useState(0)

  // ── Slider / layer state ──────────────────────────────────────────
  const [dates, setDates]         = useState([])
  const [dateIndex, setDateIndex] = useState(0)
  const [activeLayer, setActiveLayer] = useState('NDVI')
  const [selectedZone, setSelectedZone] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playInterval = useRef(null)

  // ── Fetch meta & fields from API ──────────────────────────────────
  useEffect(() => {
    setApiState('loading')
    setMissingFiles([])
    setMeta(null)
    setFields(null)
    fetch(`${API}/health`)
      .then(r => {
        if (!r.ok) throw new Error(`API returned ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then(files => {
        const missing = Object.entries(files)
          .filter(([, exists]) => !exists)
          .map(([name]) => name)
        if (missing.length > 0) {
          setMissingFiles(missing)
          setApiState('missing')
          return null
        }
        return Promise.all([
          fetch(`${API}/meta`).then(r => {
            if (!r.ok) throw new Error(`API returned ${r.status}: ${r.statusText}`)
            return r.json()
          }),
          fetch(`${API}/fields`).then(r => {
            if (!r.ok) throw new Error(`API returned ${r.status}: ${r.statusText}`)
            return r.json()
          }),
        ])
      })
      .then(results => {
        if (!results) return
        const [metaData, fieldsData] = results
        setMeta(metaData)
        setFields(fieldsData)
        setDates(metaData.dates || [])
        // Default to last date (latest imagery)
        if (metaData.dates && metaData.dates.length > 0) {
          setDateIndex(metaData.dates.length - 1)
        }
        setApiState('ready')
      })
      .catch(err => {
        console.error('API request failed:', err)
        setApiState('network')
      })
  }, [retryToken])

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
  const apiError = apiState !== 'ready'
  const errorMessage = apiState === 'network'
    ? 'API server not running. Start it with: python api/app.py'
    : apiState === 'missing'
      ? `Missing pipeline files: ${missingFiles.join(', ') || 'none reported'}. Run the pipeline with: ${PIPELINE_COMMAND}`
      : null

  return (
    <div className="dashboard">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">
          <Wheat size={18} />
          <span>FasalScan</span>
          <span className="dashboard-brand-label">Dashboard</span>
        </div>
        <div className="dashboard-actions">
          <button title="Notifications" aria-label="Notifications"><Bell size={16} /></button>
          <span className="dashboard-user"><UserRound size={15} /> Farmer</span>
          <button title="Settings" aria-label="Settings"><Settings size={16} /></button>
        </div>
      </header>
      {apiState !== 'ready' && (
        <div className={`status-banner ${apiState}`} role="status">
          {apiState === 'loading' ? (
            <><span className="spinner" aria-hidden="true" /> Loading data...</>
          ) : (
            <><span>{errorMessage}</span><button onClick={() => setRetryToken(value => value + 1)}>Retry</button></>
          )}
        </div>
      )}

      <div className="dashboard-content">
      <div className="map-container">
        <MapView
          dateIndex={dateIndex}
          activeLayer={activeLayer}
          selectedZone={selectedZone}
          onZoneSelect={handleZoneSelect}
          meta={meta}
          fields={fields}
          apiBase={API}
          apiError={!!apiError}
        />
        {apiState === 'ready' && <MapLegend layerConfig={layerConfig} />}
      </div>

      {apiError ? (
        <aside className="side-panel">
          <div className="panel-header">
            <div className="panel-logo">
              <Wheat size={22} strokeWidth={2.5} />
              <span>FasalScan</span>
            </div>
            <button
              onClick={onLogout}
              style={{
                background: 'none', border: 'none', color: 'var(--text-dim)',
                cursor: 'pointer', padding: '4px', display: 'flex', marginLeft: 'auto',
              }}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </aside>
      ) : (
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
          fields={fields}
          apiBase={API}
          apiError={false}
        />
      )}
      </div>
    </div>
  )
}
