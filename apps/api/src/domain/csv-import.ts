import {ensure} from './errors.js';
export function parseCsv(text:string):Record<string,string>[] {
 ensure(text.length<=500000,400,'CSV exceeds 500 KB');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){ensure(!cell&&!closed,400,'Unexpected CSV quote');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x!==''))rows.push(row);row=[];}}
  else{ensure(!closed,400,'Text after CSV closing quote');cell+=c;}
 }
 ensure(!quoted,400,'Unclosed CSV quote');row.push(cell);if(row.some(x=>x!==''))rows.push(row);
 ensure(rows.length>=2,400,'В CSV нет строк данных. Если вы скачали шаблон, заполните хотя бы одну строку под заголовками и загрузите файл снова.');
 ensure(rows.length<=501,400,'В CSV больше 500 строк данных. Разделите файл на части: не более 500 строк в каждой, плюс строка заголовков.');
 const header=rows.shift()!.map((s,i)=>(i===0?s.replace(/^\uFEFF/,''):s).trim());
 ensure(new Set(header).size===header.length&&header.every(Boolean),400,'Duplicate or empty headers');
 return rows.map(r=>{ensure(r.length===header.length,400,'CSV column count mismatch');return Object.fromEntries(header.map((h,i)=>[h,r[i]]));});
}
