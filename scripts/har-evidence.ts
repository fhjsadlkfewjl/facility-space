import { z } from 'zod';
import { safeSvg } from '../apps/api/src/domain/svg.js';
import type { BitrixSnapshot, LegacyElement } from '../apps/api/src/adapters/bitrix.js';
const match = z.object({ method: z.string(), ids: z.array(z.union([z.string(), z.number()])) });
const template = z.object({
  id: z.number().int(),
  name: z.string(),
  groupId: z.number().int(),
  box: z.record(z.string(), z.number().finite()),
  is_table: z.boolean(),
  previewUrl: z.string().nullable(),
  inlineSvg: z.string(),
  renderSvg: z.string().transform(safeSvg).optional(),
  svgPath: z.string(),
  geometry: z.object({
    root: z.record(z.string(), z.number().finite()),
    viewBox: z.string().nullable(),
    basis: z.array(z.record(z.string(), z.number().finite())),
  }),
  legacyMatch: match,
  status: z.literal('observed'),
  confidence: z.literal('confirmed-by-current-API'),
  unit: z.literal('SVG-user-unit'),
});
export const harSchema = z.object({
  schemaVersion: z.literal(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  editors: z.array(
    z.object({
      entryIndex: z.number().int(),
      levelId: z.number().int(),
      canvas: z.object({
        backgroundUrl: z.string().nullable(),
        viewBox: z.string(),
        width: z.number().positive(),
        height: z.number().positive(),
        renderSvg: z.string().transform(safeSvg).optional(),
      }),
      templates: z.array(template),
      items: z.array(z.object({id:z.number().int(),templateId:z.number().int(),x:z.number().finite(),y:z.number().finite(),r:z.number().finite()})).default([]),
    }),
  ),
});
export type HarEvidence = z.infer<typeof harSchema>;
const norm = (s: string) => s.trim().toLowerCase().replace(/[×х]/g, 'x').replace(/\s+/g, ' ');
// Recompute matches against this staging; never trust a mapping from a different export.
export function templateEvidence(e: LegacyElement, source: BitrixSnapshot, har?: HarEvidence) {
  if (!har) return null;
  const candidates = har.editors.flatMap((editor) => editor.templates.map((t) => ({ t, editor })));
  let matches = candidates.filter(({ t }) => String(t.id) === String(e.id));
  let method = 'id';
  if (!matches.length) {
    method = 'unique-name';
    if (
      source.elements.filter((x) => x.iblock === 132 && norm(x.name) === norm(e.name)).length !== 1
    )
      return null;
    matches = candidates.filter(({ t }) => norm(t.name) === norm(e.name));
    if (new Set(matches.map(({ t }) => t.id)).size !== 1) return null;
  }
  if (!matches.length) return null;
  const signature = ({ t }: (typeof matches)[number]) =>
    JSON.stringify([t.box, t.geometry, t.inlineSvg, t.is_table]);
  if (new Set(matches.map(signature)).size !== 1)
    return { status: 'conflict', confidence: 'none', sourceSha256: har.sourceSha256 };
  const { t, editor } = matches[0];
  return {
    ...t,
    legacyMatch: { method, ids: [e.id] },
    sourceSha256: har.sourceSha256,
    entryIndex: editor.entryIndex,
    levelId: editor.levelId,
    physicalUnitConfirmed: false,
  };
}
export function floorEvidence(id: string, har?: HarEvidence) {
  const matches = har?.editors.filter((e) => String(e.levelId) === String(id)) ?? [];
  if (!matches.length) return null;
  if (new Set(matches.map((e) => JSON.stringify(e.canvas))).size !== 1)
    return {
      status: 'conflict',
      confidence: 'none',
      width: undefined,
      height: undefined,
      renderSvg: undefined,
    };
  return {
    status: 'observed',
    confidence: 'confirmed-by-current-API',
    unit: 'SVG-user-unit',
    ...matches[0].canvas,
    sourceSha256: har!.sourceSha256,
    entryIndex: matches[0].entryIndex,
    physicalScaleConfirmed: false,
  };
}

export function itemEvidence(id: string, floorId: string, templateId: string, har?: HarEvidence) {
  const matches=(har?.editors??[]).filter(e=>String(e.levelId)===floorId).flatMap(e=>e.items).filter(i=>String(i.id)===id&&String(i.templateId)===templateId);
  if(!matches.length)return null;
  if(new Set(matches.map(i=>JSON.stringify(i))).size!==1)return {status:'conflict'};
  return {...matches[0],status:'observed',sourceSha256:har!.sourceSha256,unit:'SVG-user-unit'};
}
