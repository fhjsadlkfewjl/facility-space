// SVG dimensions are drawing units, never inferred physical metres.
export function furnitureVisual(f: {width?:number|null;depth?:number|null;template_svg?:string|null;template_geometry?:any}) {
 const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const g=f.template_geometry?.geometry,box=f.template_geometry?.box;
 const root=g?.root,basis=g?.basis?.length===1?g.basis[0]:null;
 const original=!!f.template_svg&&((positive(root?.width)&&positive(root?.height))||(positive(f.width)&&positive(f.depth)));
 const legacy=original&&positive(root?.width)&&positive(root?.height);
 const sx=positive(basis?.width)&&positive(f.width)?f.width/basis.width:1;
 const sy=positive(basis?.height)&&positive(f.depth)?f.depth/basis.height:1;
 const width=legacy?root.width*sx:(positive(f.width)?f.width:50);
 const height=legacy?root.height*sy:(positive(f.depth)?f.depth:30);
 const cx=legacy&&Number.isFinite(box?.cx)?box.cx*sx:width/2;
 const cy=legacy&&Number.isFinite(box?.cy)?box.cy*sy:height/2;
 return {original,width,height,x:-cx,y:-cy,placeholder:!original&&(!positive(f.width)||!positive(f.depth))};
}
