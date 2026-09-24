export default function MapLegend({ layerConfig }) {
  return (
    <div className="map-legend glass-panel">
      <div>
        <div className="legend-title">{layerConfig.name}</div>
      </div>
      <div>
        <div
          className="legend-bar"
          style={{ background: layerConfig.gradient }}
        />
        <div className="legend-labels">
          <span>{layerConfig.legendMin}</span>
          <span>{layerConfig.legendMax}</span>
        </div>
      </div>
    </div>
  )
}
