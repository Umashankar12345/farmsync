export default function MapLegend({ layerConfig }) {
  return (
    <div className="map-legend glass-panel">
      <div className="legend-index">
        <div className="legend-title">{layerConfig.name} Scale</div>
        <div
          className="legend-bar"
          style={{ background: layerConfig.gradient }}
        />
        <div className="legend-labels">
          <span>{layerConfig.legendMin}</span>
          <span>{layerConfig.legendMax}</span>
        </div>
      </div>
      <div style={{ width: '1px', height: '36px', background: 'rgba(51,65,85,0.4)', margin: '0 0.25rem' }} />
      <div className="legend-zones" aria-label="Zone tier colors">
        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', gridColumn: 'span 2', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Relative Risk Tiers
        </div>
        <span><i className="legend-swatch healthy" /> Healthy</span>
        <span><i className="legend-swatch medium" /> Medium risk</span>
        <span><i className="legend-swatch high" /> High risk</span>
        <span><i className="legend-swatch noncrop" /> Non-crop / bare</span>
      </div>
    </div>
  )
}
