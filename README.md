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

- **Relative ranking (tertiles)**: Risk is relative to the top 10% of zones, divided into 33% spatial tertiles for scouting priority. Thus, one-third of zones always rank as "High Risk" even when the entire farm is healthy. The UI provides an Absolute Canopy Reference (scene mean NDVI) to distinguish relative priority from actual crop failure.
- **Management zones**: Zones are a 3×3 regional grid (~200 m to 1 km), not cadastral or parcel-level field boundaries. Sharp edge colour steps reflect zone aggregate tiers; underlying raster indices use continuous global colormap stretching (-0.1 to 0.9).
- **Atmospheric anomalies (2025-01-31 fog/haze)**: The apparent dip to ~0.28 on 2025-01-31 was caused by widespread Punjab winter radiation fog / ground haze that ESA's SCL cloud mask failed to flag (reported 0% cloud). Rebounding to >0.65 by Feb 5 proves this was atmospheric, not crop loss.
- **Yield-Risk Index is not a harvest forecast**: It is an uncalibrated indicator of projected peak-NDVI shortfall relative to the peak benchmark (0.71). The farm-wide average shortfall is 9.95%, while individual zone shortfalls range from 0.0% to 20.07% (e.g. Zone 4 is 18.67%). Real yield prediction requires local crop-cutting calibration data.
- **Methodology & ML status**: All advisories and classifications are deterministic index-based formulas (NDVI, NDRE, NDMI) and rule-based agronomic logic. Optional ML/deep-learning segmentation (such as a U-Net) is future work when ground-truth parcel and scouting datasets become available. We do not claim unverified black-box AI.
- **Optical indices cannot confirm disease**: "Non-water stress" means the cause is undetermined (nutrient deficiency, delayed sowing date, soil compaction, or disease). Scouts must verify in the field.
- **Bands B05, B8A, B11, and SCL are natively 20 m**, resampled to 10 m.
- **Demo window**: Pre-fetched historical archive for Rabi season 2024–25 (Jan–Mar 2025).
- **Mock login**: Any email/password is accepted for frictionless evaluation.

## Pitch script (30 seconds)

> "FasalScan monitors wheat crop stress near Ludhiana using Sentinel-2 satellite imagery from the Rabi 2024–25 season. We compute NDVI, NDRE, and NDMI to rank management zones into relative scouting tiers — showing agronomists and scouts exactly where to inspect first. We pair this relative priority with an absolute canopy reference and an uncalibrated Yield-Risk Index. All advisories are rule-based, transparent, and physically grounded: we distinguish water stress from other undetermined stresses, but never pretend to diagnose disease from space."

## Judge Q&A

**"Is 82% a probability?"**
No. It is a relative rank versus the best 10% of zones on that date. It always sums to more than 100%.

**"Why do 33% of zones always show as High Risk?"**
Because the priority tiers are spatial tertiles (bottom 33%, middle 33%, top 33%) designed to allocate scouting labor efficiently. To evaluate absolute crop health, look at the Absolute Canopy Reference badge and mean NDVI.

**"What happened on 2025-01-31 with the sharp dip to 0.28?"**
That is a classic remote-sensing pitfall in the Indo-Gangetic plains: winter radiation fog and ground haze. The ESA SCL layer misclassified the scene as 0% cloud cover. The rapid rebound to >0.65 five days later confirms it was atmospheric attenuation rather than vegetative collapse.

**"Why do Yield-Risk numbers differ between 9.95% and higher values?"**
9.95% is the farm-wide average shortfall across all 9 zones. Individual management zones have their own specific shortfalls (e.g., Zone 4 has an 18.67% projected peak shortfall, Zone 8 has 0.0%). The card explicitly denotes which basis is currently shown.

**"Are the zones field boundaries?"**
No. They are 3×3 regional grid management units (~200 m to 1 km), not parcel-level cadastral plots. The sharp color boundaries represent zone-level summary scores. The underlying raster layer uses continuous global stretching.

**"Is this AI / U-Net?"**
No. We use transparent, physically interpretable index calculations and rule-based agronomic logic. Deep learning segmentation (such as a U-Net) is recognized as valuable future work once ground-truth field boundary and scouting data are acquired, rather than deploying an unvalidated black-box model.

**"How do you know it's disease?"**
We don't. We flag "non-water stress" which means the cause is undetermined (nutrient, disease, sowing date, or soil). Field scouts must verify the cause.

**"Is it a yield forecast?"**
No. It is a projected peak-NDVI shortfall index. Not validated against real crop-cutting harvest data.

**"Why is late-sown wheat red?"**
It is behind in vegetative growth stage, so its NDVI is lower than earlier-sown neighbours. The ranking is relative to the benchmark on that date, not a verdict of crop mortality.

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
