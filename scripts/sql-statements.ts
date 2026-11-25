// Migration files are trusted source. Split statements without breaking quoted function bodies.
export function sqlStatements(sql:string){
 const out:string[]=[];let start=0,quote='',dollar='',line=false,block=false;
 for(let i=0;i<sql.length;i++){
  const c=sql[i],n=sql[i+1];
  if(line){if(c==='\n')line=false;continue;}
  if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
  if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar='';}continue;}
  if(quote){if(c===quote){if(n===quote)i++;else quote='';}continue;}
  if(c==='-'&&n==='-'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
  if(c==="'"||c==='"'){quote=c;continue;}
  if(c==='$'){const m=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);if(m){dollar=m[0];i+=dollar.length-1;continue;}}
  if(c===';'){const s=sql.slice(start,i).trim();if(s)out.push(s);start=i+1;}
 }
 if(quote||dollar||block)throw Error('Unterminated migration literal/comment');const last=sql.slice(start).trim();if(last)out.push(last);return out;
}
