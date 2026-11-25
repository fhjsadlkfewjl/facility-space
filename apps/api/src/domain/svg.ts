import { ensure } from './errors.js';
// Deliberately small inert SVG dialect. Rebuild tokens rather than storing arbitrary XML.
const tags = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'defs',
  'clipPath',
  'mask',
]);
const attrs = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'fill-rule',
  'font-size',
  'font-family',
  'text-anchor',
  'dominant-baseline',
  'id', 'clip-rule', 'clip-path', 'mask', 'maskUnits', 'mask-type', 'display', 'overflow', 'enable-background',
]);
export function safeSvg(source: string) {
  ensure(Buffer.byteLength(source, 'utf8') <= 3000000, 413, 'SVG exceeds 3 MB');
  source = source.replace(/^\s*<\?xml[^?]*\?>/, '').trim();
  const tokens = source.match(/<[^>]*>|[^<]+/g) ?? [],
    stack: string[] = [];
  let out = '',
    roots = 0;
  ensure(tokens.join('') === source, 400, 'Invalid SVG');
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      ensure(stack.length > 0 || !token.trim(), 400, 'Invalid SVG text');
      ensure(!/[&<>]/.test(token), 400, 'SVG entities are not supported');
      out += token;
      continue;
    }
    const close = token.match(/^<\/([a-zA-Z]+)\s*>$/);
    if (close) {
      ensure(stack.pop() === close[1], 400, 'Unbalanced SVG');
      out += `</${close[1]}>`;
      continue;
    }
    const m = token.match(/^<([a-zA-Z]+)\b([\s\S]*?)(\/?)>$/);
    ensure(m && tags.has(m[1]), 400, 'Unsupported SVG element');
    if (stack.length === 0) {
      ensure(m[1] === 'svg' && roots++ === 0, 400, 'Expected single SVG root');
    }
    let rest = m[2],
      serialized = '';
    while (rest.trim()) {
      const a = rest.match(/^\s+([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(["'])([^"'<>]*)\2/);
      ensure(a && attrs.has(a[1]), 400, 'Unsupported SVG attribute');
      ensure(
        !/[&]|url\s*\(|javascript:|data:|https?:/i.test(a[3]) ||
          (a[1] === 'xmlns' && a[3] === 'http://www.w3.org/2000/svg') ||
          (['clip-path','mask'].includes(a[1]) && /^url\(#[A-Za-z0-9_-]+\)$/.test(a[3])),
        400,
        'SVG external references are forbidden',
      );
      serialized += ` ${a[1]}="${a[3]}"`;
      rest = rest.slice(a[0].length);
    }
    out += `<${m[1]}${serialized}${m[3] ? '/>' : '>'}`;
    if (!m[3]) stack.push(m[1]);
  }
  ensure(roots === 1 && stack.length === 0, 400, 'Unbalanced SVG');
  return out;
}
