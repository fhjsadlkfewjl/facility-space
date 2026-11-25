import type { Layout } from '@office/shared';
const cache=new Map<string,{x:number;y:number;width:number;height:number}>();
// Measure drawing extents, never alter the imported SVG or room geometry.
export function floorDrawingBounds(layout:Layout){
 const source=layout.floor.background_svg;
 if(source&&cache.has(source))return cache.get(source)!;
 if(source){
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  const allowed=new Set(['g','path','rect','circle','ellipse','line','polyline','polygon']);
  const attrs=new Set(['d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','transform']);
  const copy=(from:Element,to:Element)=>{for(const child of Array.from(from.children)){if(!allowed.has(child.localName))continue;const node=document.createElementNS(svg.namespaceURI,child.localName);for(const a of Array.from(child.attributes))if(attrs.has(a.name))node.setAttribute(a.name,a.value);to.appendChild(node);copy(child,node);}};
  copy(doc.documentElement,svg);document.body.appendChild(svg);
  try{const b=svg.getBBox();if(b.width>0&&b.height>0){const v={x:b.x,y:b.y,width:b.width,height:b.height};cache.set(source,v);return v;}}finally{svg.remove();}
 }
 return {x:0,y:0,width:layout.floor.width,height:layout.floor.height};
}
