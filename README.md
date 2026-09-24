# FasalScan — Crop Stress Intelligence

Satellite-powered vegetation-index dashboard for Ludhiana-area wheat management zones, Rabi season 2025.

## What it does

FasalScan visualises Sentinel-2 NDVI, NDRE, and NDMI over a grid of management zones near Ludhiana, Punjab, for January–May 2025. It computes a **relative risk ranking** (not a probability) to help prioritise field scouting, and a **Yield-Risk Index** (projected peak-NDVI shortfall) as an uncalibrated indicator of potential underperformance. All advisories are **rule-based**, not AI-generated.

## Method

1. **Ingestion**: Sentinel-2 L2A scenes from the Copernicus STAC API.
2. **Cloud masking**: Using the Scene Classification Layer (SCL). Bands B05, B8A, B11, and SCL are natively 20 m, resampled to 10 m.
3. **Vegetation indices**:
   - **NDVI** = (B08 − B04) / (B08 + B04) — Tucker 1979
   - **NDRE** = (B8A − B05) / (B8A + B05) — NDRE is more sensitive to early chlorophyll change than NDVI. (B07/B05 variant also used in literature; Barnes et al. 2000, to verify.)
   - **NDMI** = (B8A − B11) / (B8A + B11) — NIR+SWIR moisture index (Gao 1996, also called NDMI by Wilson & Sader 2002). This is NOT McFeeters' open-water NDWI.
4. **Risk ranking**: Per-date benchmark = 90th percentile of zone NDVI. Risk = (1 − zone_NDVI / benchmark) × 100. Severity tiers = tertiles of the risk distribution.
5. **Yield-Risk Index**: proj_peak = zone_NDVI_now × (bench_peak / bench_now). Shortfall = (1 − proj_peak / bench_peak) × 100. Design choice — assumes zones keep their current ratio to the benchmark until peak.
6. **Stress classes**: Healthy / Water-related stress / Non-water stress (cause undetermined: nutrient, disease, or sowing date). Optical indices cannot confirm disease.
7. **Advisory**: Rule-based. Never uses "urgently", "needed", "disease detected", or "will".

## Constants

| Value | Used for | Source |
|-------|----------|--------|
| 0.70 | NDVI healthy threshold | Design choice |
| 0.50 | NDVI stressed threshold | Design choice |
| 0.35 | NDVI critical threshold | Design choice |
| 0.10 | NDMI water-stress threshold | Design choice |
| 90th percentile | Benchmark for risk ranking | Design choice |
| Tertiles | Risk tier boundaries (Low/Medium/High) | Design choice |

None of these are "from the literature." They are design choices tuned for visual usefulness on this dataset.

## Limitations

- **Risk is relative** to the top 10% of zones, so some zones always rank high — even when the entire farm is healthy.
- **Management zones** are a 200 m grid, not real field boundaries.
- **Optical indices cannot confirm disease.** "Non-water stress" means the cause is undetermined (nutrient, disease, or sowing date). The app does not detect disease.
- **Yield-Risk Index is not a forecast.** It is a projected peak-NDVI shortfall and would need local crop-cutting data to calibrate.
- **Bands B05, B8A, B11, and SCL are natively 20 m**, resampled to 10 m.
- **Late-sown fields** can rank as at-risk simply because they are behind in growth stage; the risk is relative, not a statement of failure.
- **Login is mocked** — no real authentication. Any email/password is accepted.
- **All advisories are rule-based**, not AI-generated.

## Pitch script (30 seconds)

> "FasalScan monitors wheat stress near Ludhiana using free Sentinel-2 imagery. We compute NDVI, NDRE, and NDMI to rank management zones by relative risk — helping farmers decide where to scout first. Our Yield-Risk Index shows projected peak-NDVI shortfall so you can see which zones may underperform. All advisories are rule-based and transparent. We flag stress classes — water-related or undetermined — but we don't claim to diagnose disease from space."

## Judge Q&A

**"Is 82% a probability?"**
No. It is a relative rank versus the best 10% of zones on that date. It always sums to more than 100%.

**"Why 0.60 / 0.25 / 0.30 / 0.10?"**
Design choices. Not from a paper. They were tuned for visual separation on this dataset.

**"Is this AI?"**
The advisory is rule-based. If a U-Net is added for zone segmentation, it would be trained on the rule-based labels — so it mostly regularises them into contiguous areas. There is no ground-truth validation.

**"How do you know it's disease?"**
We don't. We flag "non-water stress" which means the cause is undetermined. Scouts should verify in the field.

**"Is it a yield forecast?"**
No. It is a projected peak-NDVI shortfall index. Not validated against real yield data.

**"Why is late-sown wheat red?"**
It is behind in growth stage, so its NDVI is lower than earlier-sown neighbours. The ranking is relative, not a statement of crop failure.

## References

- Tucker 1979, _Remote Sensing of Environment_ 8:127–150 (NDVI)
- Gao 1996, _RSE_ 58:257–266 (NIR+SWIR moisture index)
- Wilson & Sader 2002, _RSE_ 80:385–396 (NDMI naming convention)
- McFeeters 1996, _Int. J. Remote Sensing_ 17:1425–1432 (open-water NDWI — NOT used here)
- Gitelson, Merzlyak & Lichtenthaler 1996, _J. Plant Physiol._ 148:501–508
- Barnes et al. 2000, 5th Int. Conf. Precision Agriculture (NDRE — _to verify_)
- Kogan 1995, _Advances in Space Research_ 15(11):91–100 (VCI; cited as "inspired by" — our benchmark is spatial per date, VCI is temporal per pixel)
- ESA Sentinel-2 L2A product specification (scale, offset, SCL)

## Running locally

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173/`.
