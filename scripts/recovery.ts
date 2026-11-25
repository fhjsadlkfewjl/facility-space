import { templateEvidence, floorEvidence, type HarEvidence } from './har-evidence.js';
import type { BitrixSnapshot, LegacyElement } from '../apps/api/src/adapters/bitrix.js';
import { parseShape } from '../apps/api/src/adapters/bitrix.js';
import { polygonArea } from '../apps/api/src/facility.js';
export const property = (e: LegacyElement, k: string) => e.properties[k]?.[0] ?? '';
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export function scaleEvidence(rooms: LegacyElement[]) {
  const samples = rooms.flatMap((r) => {
    const shape = parseShape(property(r, 'SHAPE')),
      area = Number(property(r, 'AREA').trim().replace(',', '.'));
    if (!r.active || !shape.polygon || !Number.isFinite(area) || !(area > 0)) return [];
    const units = polygonArea(shape.polygon, 1);
    return units > 0
      ? [
          {
            roomId: r.id,
            area_m2: area,
            area_units2: units,
            meters_per_unit: Math.sqrt(area / units),
          },
        ]
      : [];
  });
  if (!samples.length)
    return {
      status: 'unknown',
      confidence: 'unknown',
      candidate: null,
      samples,
      reason: 'No positive AREA with exact valid polygon',
    };
  const candidate = median(samples.map((s) => s.meters_per_unit));
  const deviations = samples.map((s) => Math.abs(s.meters_per_unit / candidate - 1));
  const inliers = deviations.filter((x) => x <= 0.1).length;
  const confidence =
    samples.length >= 5 && inliers / samples.length >= 0.8 && median(deviations) <= 0.03
      ? 'medium'
      : 'low';
  return {
    status: 'inferred',
    confidence,
    candidate,
    samples,
    inliers,
    relative_mad: median(deviations),
    outlierRoomIds: samples.filter((_, i) => deviations[i] > 0.1).map((s) => s.roomId),
    sampleCount: samples.length,
    officialScaleModified: false,
    reason:
      'Median sqrt(legacy AREA / exact polygon area); AREA and common coordinate system not independently verified',
  };
}
export function dimensionEvidence(name: string) {
  const m = name.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)(?=\s|$)/i);
  if (!m)
    return {
      status: 'unknown',
      confidence: 'none',
      default_width: null,
      default_depth: null,
      unit: 'm',
      source: 'No unambiguous rectangular dimensions',
    };
  return {
    status: 'inferred',
    confidence: 'low',
    default_width: Number(m[1].replace(',', '.')) / 100,
    default_depth: Number(m[2].replace(',', '.')) / 100,
    unit: 'm',
    source: 'Template label; centimetres assumed, not measured. Not SVG units.',
  };
}
export function recoveryEvidence(source: BitrixSnapshot, har?: HarEvidence) {
  const result = {
    floors: source.elements
      .filter((e) => e.iblock === 134)
      .map((e) => ({
        id: 'fl-' + e.id,
        legacyId: e.id,
        buildingId: property(e,'BUILDING_ID'),
        bgFileId: property(e, 'BG') || null,
        svgStatus: 'missing',
        apiGeometry: floorEvidence(e.id, har),
        scale: scaleEvidence(
          source.elements.filter((r) => r.iblock === 135 && property(r, 'LEVEL_ID') === e.id),
        ),
      })),
    templates: source.elements
      .filter((e) => e.iblock === 132)
      .map((e) => ({
        id: 't-' + e.id,
        legacyId: e.id,
        name: e.name,
        svgFileId: property(e, 'SVG') || null,
        dimensions: dimensionEvidence(e.name),
        apiGeometry: templateEvidence(e, source, har),
      })),
  };
  for(const floor of result.floors){
    const peers=result.floors.filter(f=>f.buildingId===floor.buildingId&&f.scale.candidate!==null);
    const center=peers.length?median(peers.map(f=>f.scale.candidate!)):null;
    Object.assign(floor.scale,{buildingConsistency:{sampleFloors:peers.length,medianCandidate:center,relativeDeviation:center&&floor.scale.candidate?Math.abs(floor.scale.candidate/center-1):null,usedToPromoteConfidence:false},confirmedFurnitureSamples:0,physicalDimensionEvidence:'No externally confirmed furniture dimensions available; label dimensions remain hypotheses'});
  }
  return result;
}
