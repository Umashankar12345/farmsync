import { useState, useEffect } from 'react'
import {
  Wheat, Play, Pause, Calendar, AlertTriangle, TrendingDown,
  Layers, BarChart3, FileText, LogOut, Info, Database, ShieldAlert,
  ExternalLink
} from 'lucide-react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts'
import {
  LAYER_CONFIG,
} from '../data/layerConfig'

function GithubIcon({ size = 16, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
    </svg>
  )
}

// Largest-remainder method (Hare-Niemeyer) ensures integer percentages sum to exactly 100
function largestRemainderRound(counts, totalTarget = 100) {
  const keys = Object.keys(counts)
  const totalCount = keys.reduce((acc, k) => acc + (counts[k] || 0), 0)
  if (totalCount === 0) {
    return keys.reduce((acc, k) => ({ ...acc, [k]: 0 }), {})
  }

  const items = keys.map(key => {
    const rawVal = ((counts[key] || 0) / totalCount) * totalTarget
    const floor = Math.floor(rawVal)
    return { key, floor, remainder: rawVal - floor }
  })

  const diff = totalTarget - items.reduce((sum, item) => sum + item.floor, 0)
  items.sort((a, b) => b.remainder - a.remainder)

  for (let i = 0; i < diff; i++) {
    items[i % items.length].floor += 1
  }

  const result = {}
  items.forEach(item => {
    result[item.key] = item.floor
  })
  return result
}

const ZONE_HECTARES = {
  'zone-1': '1,105',
  'zone-4': '1,239',
  'zone-2': '1,263',
  'zone-3': '1,243',
  'zone-0': '1,255',
  'zone-7': '1,136',
  'zone-6': '1,212',
  'zone-5': '1,118',
  'zone-8': '1,188',
}


export default function SidePanel({
  dateIndex, setDateIndex,
  activeLayer, setActiveLayer,
  selectedZone, onZoneSelect,
  isPlaying, togglePlay,
  onLogout,
  dates,
  fields = null,
  apiBase,
  apiError,
}) {
  const [showAbout, setShowAbout] = useState(false)
  const [reportNotice, setReportNotice] = useState(false)

  // ── API data: stats + data-quality (fields passed from Dashboard) ──
  const apiFields = fields?.features || null
  const [apiStats,  setApiStats]  = useState(null)
  const [apiDQ,     setApiDQ]     = useState(null)

  useEffect(() => {
    if (apiError) return
    Promise.all([
      fetch(`${apiBase}/stats`).then(r  => r.ok ? r.json() : null).catch(() => null),
      fetch(`${apiBase}/data-quality`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([stats, dq]) => {
      if (stats)  setApiStats(stats)
      if (dq)     setApiDQ(dq)
    })
  }, [apiBase, apiError])

  // ── Effective dates array from the API ──────────────────────────
  const effectiveDates = dates || []
  const currentDateLabel = effectiveDates[dateIndex] ?? ''

  // ── Farm composition & absolute vigor ─────────────────────────────
  let composition, yieldRisk, sortedZones, chartZone, chartData, selectedZoneFeature, effectiveZoneObj
  let farmMeanNdviNow = null
  let farmAbsoluteStatus = { label: 'Normal Growth', color: 'var(--emerald-400)' }

  if (apiFields && apiFields.length > 0) {
    const tierCounts = { healthy: 0, medium: 0, high: 0 }
    apiFields.forEach(f => { tierCounts[f.properties.tier] = (tierCounts[f.properties.tier] || 0) + 1 })
    composition = largestRemainderRound({
      healthy:  tierCounts.healthy || 0,
      stressed: tierCounts.medium  || 0,
      critical: tierCounts.high    || 0,
    })
    yieldRisk = apiStats?.farm_shortfall_pct ?? 'n/a'

    // Compute absolute farm mean NDVI for current date across valid pixels
    const validCurrentNdvis = apiFields
      .map(f => f.properties?.ndvi_series?.[currentDateLabel])
      .filter(v => v != null && !isNaN(v))
    if (validCurrentNdvis.length > 0) {
      farmMeanNdviNow = validCurrentNdvis.reduce((a, b) => a + b, 0) / validCurrentNdvis.length
      if (farmMeanNdviNow >= 0.70) {
        farmAbsoluteStatus = { label: 'Vigorous Canopy (Healthy)', color: '#34d399' }
      } else if (farmMeanNdviNow >= 0.50) {
        farmAbsoluteStatus = { label: 'Moderate Canopy (Normal)', color: '#fbbf24' }
      } else {
        farmAbsoluteStatus = { label: 'Low Greenness / Sparse Canopy', color: '#fb7185' }
      }
    }

    selectedZoneFeature = apiFields.find(f => f.properties.id === selectedZone) ?? null

    // Sort by season_score desc (same as yield_risk.py output)
    sortedZones = [...apiFields]
      .sort((a, b) => (b.properties.season_score ?? 0) - (a.properties.season_score ?? 0))
      .map(f => {
        const rawStress = f.properties.stress_class ?? 'n/a'
        const causeHint = (rawStress.includes('Non-water stress') || rawStress.includes('undetermined'))
          ? 'Cause unclear (NDMI normal, NDVI low)'
          : rawStress
        const zoneName = f.properties.name || `Zone ${f.properties.id.replace('zone-', '')}`
        const crop = 'Wheat (assumed, Rabi)'
        const activeDateKey = effectiveDates[dateIndex]
        const ndviOnDate = (f.properties.ndvi_series && activeDateKey)
          ? f.properties.ndvi_series[activeDateKey]
          : f.properties.mean_ndvi

        const cropHa = f.properties.crop_hectares != null ? Math.round(f.properties.crop_hectares) : Math.round(f.properties.hectares ?? 1200)
        const totalHa = f.properties.hectares != null ? Math.round(f.properties.hectares) : 1200
        const maskedPct = f.properties.masked_noncrop_pct != null ? f.properties.masked_noncrop_pct : (f.properties.masked_pct ?? 0)
        const maskedHa = f.properties.masked_noncrop_ha != null ? f.properties.masked_noncrop_ha : 0

        return {
          id:        f.properties.id,
          name:      zoneName,
          crop:      crop,
          severity:  { healthy: 'healthy', medium: 'warning', high: 'critical' }[f.properties.tier] ?? 'healthy',
          risk:      f.properties.season_score != null ? Math.round(f.properties.season_score) : 0,
          stressType: causeHint,
          meanNdvi:  f.properties.mean_ndvi ?? 0,
          latestNdvi: ndviOnDate ?? (f.properties.mean_ndvi ?? 0),
          shortfall: f.properties.shortfall_pct ?? 0,
          hectares:  `${cropHa.toLocaleString()}`,
          totalHectares: `${totalHa.toLocaleString()}`,
          cropHectares: `${cropHa.toLocaleString()}`,
          maskedPct: Number(maskedPct).toFixed(1),
          maskedHa: Number(maskedHa).toFixed(1),
          lowConfidence: f.properties.low_confidence ?? false,
          advisoryText: f.properties.advisory_text ?? '',
          advisoryEvidence: f.properties.advisory_evidence ?? '',
        }
      })

    // Selected zone or default to top-risk zone
    effectiveZoneObj = sortedZones.find(z => z.id === selectedZone) ?? sortedZones[0] ?? null
    const effectiveZoneFeature = (selectedZone
      ? apiFields.find(f => f.properties.id === selectedZone)
      : null) ?? (sortedZones[0] ? apiFields.find(f => f.properties.id === sortedZones[0].id) : apiFields[0])

    const ndviDict = effectiveZoneFeature?.properties?.ndvi_series ?? {}
    chartZone = { name: effectiveZoneObj?.name ?? (effectiveZoneFeature?.properties?.name ?? 'Zone 1') }
    chartData = Object.entries(ndviDict)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ndvi]) => ({ date: date.slice(5), ndvi }))
  } else {
    composition = { healthy: 0, stressed: 0, critical: 0 }
    yieldRisk = 'n/a'
    sortedZones = []
    chartZone = { name: 'No data' }
    chartData = []
    selectedZoneFeature = null
    effectiveZoneObj = null
  }

  // ── Report Export Notice (Planned Feature) ────────────────────────
  const handleExport = () => {
    setReportNotice(true)
    setTimeout(() => setReportNotice(false), 5000)
  }

  return (
    <aside className="side-panel">
      {/* 1. Header */}
      <div className="panel-header">
        <div className="panel-logo">
          <Wheat size={22} strokeWidth={2.5} />
          <span>FasalScan</span>
        </div>
        <span className="panel-badge" title="Pre-fetched Sentinel-2 scenes, Jan–Mar 2025 archive">Demo: Rabi 2024–25</span>
        <a
          href="https://github.com/Umashankar12345/farmsync"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', padding: '4px', display: 'flex', textDecoration: 'none',
            marginLeft: 'auto',
          }}
          title="View Source on GitHub"
          aria-label="View Source on GitHub"
        >
          <GithubIcon size={16} />
        </a>
        <button
          onClick={() => setShowAbout(true)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', padding: '4px', display: 'flex',
          }}
          title="About & Limitations"
          aria-label="About & Limitations"
        >
          <Info size={16} />
        </button>
        <button
          onClick={onLogout}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', padding: '4px', display: 'flex',
          }}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* 2. Verdict Banner & Selected Field Precision Card */}
      <div className="panel-section">
        {/* One-line verdict banner */}
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '8px',
          padding: '0.65rem 0.85rem',
          marginBottom: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <AlertTriangle size={18} style={{ color: '#f87171', flexShrink: 0 }} />
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fecaca', lineHeight: 1.35 }}>
            3 of 9 zones need scouting. <span style={{ color: '#ffffff', fontWeight: 700 }}>{sortedZones[0]?.name ?? 'Zone 1'} is the most urgent.</span>
          </div>
        </div>

        {/* Selected Field Precision Card (Agromonitoring / EOS Style) */}
        {effectiveZoneObj && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            marginBottom: '0.9rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Wheat size={16} style={{ color: 'var(--emerald-400)' }} />
                  {effectiveZoneObj.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                  Crop: <strong style={{ color: '#cbd5e1' }}>{effectiveZoneObj.crop}</strong> · Area: <strong style={{ color: '#cbd5e1' }}>{effectiveZoneObj.cropHectares} ha crop</strong>
                </div>
                <div style={{ fontSize: '0.67rem', color: '#f59e0b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🛡️</span>
                  <span>{effectiveZoneObj.maskedPct}% of area masked as non-crop ({effectiveZoneObj.maskedHa} ha urban/roads)</span>
                </div>
              </div>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '20px',
                background: effectiveZoneObj.severity === 'critical' ? 'rgba(239, 68, 68, 0.2)' : effectiveZoneObj.severity === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: effectiveZoneObj.severity === 'critical' ? '#f87171' : effectiveZoneObj.severity === 'warning' ? '#fbbf24' : '#34d399',
                border: `1px solid ${effectiveZoneObj.severity === 'critical' ? 'rgba(239, 68, 68, 0.4)' : effectiveZoneObj.severity === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {effectiveZoneObj.severity === 'critical' ? 'High Risk' : effectiveZoneObj.severity === 'warning' ? 'Medium Risk' : 'Healthy'}
              </span>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.65rem' }}>
              <div style={{ background: 'rgba(30, 41, 59, 0.65)', padding: '0.5rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <div style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase' }}>Zone NDVI</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399', fontFamily: 'monospace', marginTop: '2px' }}>
                  {effectiveZoneObj.latestNdvi != null ? Number(effectiveZoneObj.latestNdvi).toFixed(2) : effectiveZoneObj.meanNdvi.toFixed(2)}
                </div>
              </div>
              <div
                style={{ background: 'rgba(30, 41, 59, 0.65)', padding: '0.5rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(51, 65, 85, 0.4)', cursor: 'help' }}
                title="Shortfall vs the farm's best zone: percentage gap between this zone's projected peak canopy vigor and the farm's top benchmark (0.77)."
              >
                <div style={{ fontSize: '0.58rem', color: '#94a3b8', textTransform: 'uppercase', lineHeight: 1.2 }}>
                  Shortfall vs best zone
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fb7185', fontFamily: 'monospace', marginTop: '2px' }}>
                  {effectiveZoneObj.shortfall != null ? `${effectiveZoneObj.shortfall}%` : 'n/a'}
                </div>
              </div>
              <div
                style={{ background: 'rgba(30, 41, 59, 0.65)', padding: '0.5rem 0.6rem', borderRadius: '6px', border: '1px solid rgba(51, 65, 85, 0.4)', cursor: 'help' }}
                title={`${effectiveZoneObj.name} is in the worst ${effectiveZoneObj.risk}% of zones by NDVI.`}
              >
                <div style={{ fontSize: '0.58rem', color: '#94a3b8', textTransform: 'uppercase', lineHeight: 1.2 }}>
                  Rank among zones
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace', marginTop: '2px' }}>
                  {effectiveZoneObj.risk}%
                </div>
              </div>
            </div>

            {/* Diagnosis & Action */}
            <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginBottom: '0.4rem', lineHeight: 1.4 }}>
              <span style={{ color: '#94a3b8' }}>Diagnosis: </span>
              <strong style={{ color: '#ffffff' }}>{effectiveZoneObj.stressType}</strong>
            </div>
            {effectiveZoneObj.advisoryText && (
              <div style={{
                fontSize: '0.70rem',
                color: '#93c5fd',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                lineHeight: 1.35,
              }}>
                💡 {effectiveZoneObj.advisoryText}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Management Zones List (All Zones) */}
      <div className="panel-section">
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={14} /> Management Zones ({sortedZones.length})
          </span>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400 }}>
            {currentDateLabel}
          </span>
        </div>
        <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginBottom: '0.6rem', lineHeight: 1.3 }}>
          Click any zone to inspect on map, view stats and historical NDVI trend.
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          maxHeight: '260px',
          overflowY: 'auto',
          paddingRight: '2px',
        }}>
          {sortedZones.map((zone) => {
            const isSelected = selectedZone === zone.id || (!selectedZone && zone.id === sortedZones[0]?.id)
            return (
              <div
                key={zone.id}
                onClick={() => onZoneSelect(zone.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onZoneSelect(zone.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  background: isSelected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(15, 23, 42, 0.6)',
                  border: isSelected ? '1px solid var(--emerald-500)' : '1px solid rgba(51, 65, 85, 0.35)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`risk-dot ${zone.severity}`} />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                      {zone.name}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
                      {zone.crop} · {zone.cropHectares} ha crop ({zone.maskedPct}% non-crop)
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, fontFamily: 'monospace', color: zone.latestNdvi < 0.45 ? '#fb7185' : zone.latestNdvi < 0.55 ? '#fbbf24' : '#34d399' }}>
                    {zone.latestNdvi != null ? Number(zone.latestNdvi).toFixed(2) : zone.meanNdvi.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
                    {zone.severity === 'critical' ? 'Scout' : zone.severity === 'warning' ? 'Monitor' : 'Optimal'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4. Selected Zone Linear Trend Chart */}
      <div className="panel-section">
        <div className="section-title">
          <BarChart3 size={14} /> NDVI Temporal Profile — {chartZone.name}
        </div>
        <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginBottom: '0.5rem', lineHeight: 1.3 }}>
          Overpass observations from Jan to Mar 2025 (Sentinel-2 L2A).
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="ndviGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    const isHaze = data.date === '01-31'
                    return (
                      <div style={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(51,65,85,0.5)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#f1f5f9',
                        fontSize: 12,
                        backdropFilter: 'blur(12px)',
                      }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>2025-{data.date}</div>
                        <div style={{ fontWeight: 600, color: '#34d399', marginTop: 2 }}>
                          NDVI: {data.ndvi != null ? Number(data.ndvi).toFixed(3) : 'No data'}
                        </div>
                        {isHaze && (
                          <div style={{
                            color: '#fbbf24', fontSize: '0.65rem', marginTop: 4,
                            maxWidth: 190, lineHeight: 1.25, borderTop: '1px solid rgba(251,191,36,0.3)',
                            paddingTop: 3,
                          }}>
                            ⚠️ Probable winter radiation fog / thin haze in Punjab. SCL missed cloud mask.
                          </div>
                        )}
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="linear"
                connectNulls={false}
                dataKey="ndvi"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#ndviGradient)"
                dot={(props) => {
                  const { cx, cy, payload } = props
                  if (cx == null || cy == null || payload.ndvi == null) return null
                  const isHaze = payload.date === '01-31'
                  return (
                    <circle
                      key={`dot-${payload.date}`}
                      cx={cx}
                      cy={cy}
                      r={isHaze ? 5 : 3.5}
                      fill={isHaze ? '#f59e0b' : '#10b981'}
                      stroke={isHaze ? '#fef08a' : '#0f172a'}
                      strokeWidth={isHaze ? 2 : 1}
                    />
                  )
                }}
                activeDot={{ r: 6, fill: '#34d399', strokeWidth: 2, stroke: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.4rem', fontStyle: 'italic', display: 'flex', justifyContent: 'space-between' }}>
          <span>Discrete satellite overpass dates (linear)</span>
          <span style={{ color: '#fbbf24' }}>● Jan 31: Fog/haze flag</span>
        </div>
      </div>

      {/* 5. Farm Overview: Tier Distribution + Canopy Reference */}
      <div className="panel-section">
        <div className="section-title">
          <Calendar size={14} /> Farm Overview &amp; Canopy Health
        </div>

        {/* Shortened Tier Distribution */}
        <div style={{ marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.74rem', color: '#cbd5e1', fontWeight: 600 }}>
              Relative tiers: always 1/3 of zones rank High Risk
            </span>
            <span
              style={{ cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
              title="Management zones partition the 10,758 ha scene into 9 operational sectors (~1,100–1,250 ha gross) via multi-spectral SLIC segmentation, with non-crop built-up land masked out per zone. Relative tiers divide zones into 33% spatial tertiles for scouting priority. 1/3 of zones always rank High Risk regardless of whether the farm overall is thriving. Check Scene Mean NDVI for absolute crop health."
            >
              <Info size={13} />
            </span>
          </div>
          <div className="composition-bar">
            <div className="composition-segment" style={{ width: `${composition.healthy}%`, background: 'var(--emerald-400)' }} />
            <div className="composition-segment" style={{ width: `${composition.stressed}%`, background: 'var(--amber-400)' }} />
            <div className="composition-segment" style={{ width: `${composition.critical}%`, background: 'var(--rose-400)' }} />
          </div>
          <div className="composition-labels">
            <div className="composition-label">
              <span className="composition-dot" style={{ background: 'var(--emerald-400)' }} />
              Low Risk {composition.healthy}%
            </div>
            <div className="composition-label">
              <span className="composition-dot" style={{ background: 'var(--amber-400)' }} />
              Medium Risk {composition.stressed}%
            </div>
            <div className="composition-label">
              <span className="composition-dot" style={{ background: 'var(--rose-400)' }} />
              High Risk {composition.critical}%
            </div>
          </div>
        </div>

        {/* Absolute Crop Vigor Reference */}
        <div style={{
          padding: '0.55rem 0.75rem', borderRadius: '6px',
          background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(51, 65, 85, 0.4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '0.65rem',
        }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Absolute Canopy Reference</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: farmAbsoluteStatus.color }}>
              {farmAbsoluteStatus.label}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Scene Mean NDVI</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
              {farmMeanNdviNow != null ? farmMeanNdviNow.toFixed(2) : 'n/a'}
            </div>
          </div>
        </div>

        {/* Data Quality summary trigger button */}
        <div
          onClick={() => setShowAbout(true)}
          style={{
            cursor: 'pointer',
            padding: '0.45rem 0.65rem',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(51, 65, 85, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: '#cbd5e1',
            transition: 'all 0.2s',
          }}
          title="Click to view sensor calibration, cloud masking, and STAC provenance"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Database size={13} style={{ color: 'var(--emerald-400)' }} />
            <span>9/9 scenes · 6.9% cloud masked · baseline 05.11</span>
          </div>
          <span style={{ color: 'var(--emerald-400)', fontSize: '0.68rem', fontWeight: 600 }}>Info ➔</span>
        </div>
      </div>


      {/* Export Report */}
      <div className="panel-section">
        <button
          className="btn-report"
          onClick={handleExport}
          id="export-btn"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <FileText size={16} />
          <span>Generate Report</span>
          <span style={{
            fontSize: '0.62rem',
            padding: '0.15rem 0.45rem',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.2)',
            marginLeft: 'auto',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Planned
          </span>
        </button>
        {reportNotice && (
          <div style={{
            marginTop: '0.5rem',
            padding: '0.55rem 0.75rem',
            borderRadius: '6px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#93c5fd',
            fontSize: '0.73rem',
            lineHeight: 1.45,
          }}>
            ℹ️ <strong>Planned Feature:</strong> PDF export will generate field scouting sheets with NDVI maps, zonal risk rankings, and agronomist advisories.
          </div>
        )}
      </div>

      {/* About & Limitations Modal */}
      {showAbout && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={() => setShowAbout(false)}
        >
          <div
            className="glass-panel-strong"
            style={{
              maxWidth: 540, maxHeight: '80vh', overflow: 'auto',
              padding: '2rem', lineHeight: 1.7,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--emerald-400)' }}>
              <ShieldAlert size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
              About & Limitations
            </h2>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              What it does &amp; Scope
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              FasalScan visualises Sentinel-2 satellite vegetation indices (NDVI, NDRE, NDMI) over Ludhiana-area
              wheat management zones for the Rabi 2024–25 demo window (Jan–Mar 2025). It computes relative risk rankings
              and a projected peak-NDVI shortfall index to help prioritize field scouting.
            </p>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              Limitations &amp; Honesty Disclaimers
            </h3>
            <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li><strong>Relative ranking (tertiles):</strong> Risk tiers divide zones into 33% spatial tertiles for scouting priority. Even on a flourishing farm, 1/3 of zones always rank as "High Risk". Refer to the Absolute Canopy Reference (scene mean NDVI) for true crop condition.</li>
              <li><strong>Management zones &amp; non-crop masking:</strong> The 10,758 ha scene is clustered into 9 contiguous management sectors (~1,100–1,250 ha gross) via multi-spectral SLIC segmentation to balance regional scouting operations. Built-up surfaces, concrete roads, and non-crop land (peak NDVI &lt; 0.20, totaling 546 ha / 5.1%) are strictly masked out so urban concrete does not drag down agricultural NDVI ratings.</li>
              <li><strong>Atmospheric anomaly (2025-01-31):</strong> Apparent dip to ~0.28 is widespread Punjab winter radiation fog / thin haze undetected by ESA's SCL cloud mask (0% cloud flag), not crop failure. Rebounds to normal vigor by Feb 5.</li>
              <li><strong>Yield-Risk Index is not a yield forecast:</strong> It indicates projected peak-NDVI shortfall relative to the peak benchmark (0.77). Farm average is ~13.2%, while individual zone shortfalls range from 0.0% to 29.8%. It requires local crop-cutting calibration.</li>
              <li><strong>Methodology &amp; ML stance:</strong> Current system uses transparent index mathematics (NDVI, NDRE, NDMI) with rule-based agronomic logic. Optional ML/deep-learning segmentation (such as a U-Net) is future work once ground-truth field labels exist; we do not claim unvalidated black-box AI.</li>
              <li><strong>Spectral limits:</strong> Optical indices cannot confirm disease; "cause unclear" indicates undetermined cause (nutrient, sowing date, soil, or disease) requiring field verification.</li>
              <li><strong>Native resolution:</strong> Bands B05, B8A, B11, and SCL are natively 20 m, resampled to 10 m.</li>
              <li><strong>Data Quality &amp; Sensors:</strong> 9/9 scenes used · 6.9% seasonal cloud masking · ESA baseline 05.11 DN offset (-1000) applied · Sentinel-2A/2B L2A via Planetary Computer.</li>
              <li><strong>Mock authentication:</strong> Accepts any credentials for evaluator convenience.</li>
            </ul>

            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1rem' }}>
              Constants (design choices)
            </h3>
            <table style={{ fontSize: '0.73rem', color: 'var(--text-muted)', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--text-dim)' }}>Value</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--text-dim)' }}>Used for</th>
                  <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--text-dim)' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['0.70', 'NDVI healthy threshold', 'Design choice'],
                  ['0.50', 'NDVI stressed threshold', 'Design choice'],
                  ['0.35', 'NDVI critical threshold', 'Design choice'],
                  ['0.10', 'NDMI water-stress threshold', 'Design choice'],
                  ['90th %ile', 'Benchmark percentile', 'Design choice'],
                  ['Tertiles', 'Risk tier boundaries', 'Design choice'],
                ].map(([val, use, src], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                    <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace', color: 'var(--emerald-400)' }}>{val}</td>
                    <td style={{ padding: '0.3rem 0.5rem' }}>{use}</td>
                    <td style={{ padding: '0.3rem 0.5rem', fontStyle: 'italic' }}>{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(51, 65, 85, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a
                href="https://github.com/Umashankar12345/farmsync"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#38bdf8',
                  fontSize: '0.8rem',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                <GithubIcon size={15} />
                <span>github.com/Umashankar12345/farmsync</span>
                <ExternalLink size={12} />
              </a>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Release: demo-credible</span>
            </div>

            <button
              onClick={() => setShowAbout(false)}
              style={{
                marginTop: '1.2rem', padding: '0.5rem 1.5rem',
                background: 'var(--emerald-500)', color: 'var(--bg-primary)',
                border: 'none', borderRadius: '8px', fontWeight: 600,
                cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
