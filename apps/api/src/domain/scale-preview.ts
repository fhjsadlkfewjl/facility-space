import {validPolygon} from './geometry.js';
export function contourArea(points:number[][]){let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a[0]*b[1]-b[0]*a[1];}return Math.abs(sum)/2;}
export function scalePreview(rooms:any[]){
 const rows=rooms.filter(r=>r.active).map(r=>({id:r.id,name:r.name,official:r.area_m2==null?null:Number(r.area_m2),units:r.shape?.polygon&&validPolygon(r.shape.polygon)?contourArea(r.shape.polygon):null}));
 const samples=rows.filter(r=>r.units&&r.official!==null&&r.official>0);
 const scales=samples.map(r=>Math.sqrt(r.official!/r.units!)).sort((a,b)=>a-b);
 const n=scales.length,candidate=n?(n%2?scales[(n-1)/2]:(scales[n/2-1]+scales[n/2])/2):null;
 const preview=rows.map(r=>{const calculated=candidate&&r.units?r.units*candidate*candidate:null;return {...r,calculated,deviation:r.official&&calculated!==null?Math.abs(calculated/r.official-1):null};});
 const conflicts=preview.filter(r=>r.deviation!==null&&r.deviation>0.1);
 return {candidate,sampleCount:n,consistent:n>=3&&conflicts.length===0,conflicts:conflicts.length,recoverable:preview.filter(r=>r.official===null&&r.calculated!==null).length,withoutContour:preview.filter(r=>!r.units).length,rooms:preview};
}
