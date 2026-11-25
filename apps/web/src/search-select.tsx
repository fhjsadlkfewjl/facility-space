import React, {useEffect,useId,useRef,useState} from 'react';
type Option={id:string;label:string;detail?:string};
export function SearchSelect({label,value,options,onChange,onSearch,loading=false,minimum=0,placeholder='Поиск по названию'}:{label:string;value:string;options:Option[];onChange:(value:string)=>void;onSearch?:(query:string)=>void;loading?:boolean;minimum?:number;placeholder?:string}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState<Option>();
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 const selected=options.find(o=>o.id===value)??(chosen?.id===value?chosen:undefined);
 const visible=onSearch?options:options.filter(o=>o.label.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const choose=(o:Option)=>{setChosen(o);onChange(o.id);setOpen(false);trigger.current?.focus();};
 return <div className="search-select" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
  <span id={id+'-label'} className="search-select-label">{label}</span>
  <button ref={trigger} type="button" className="search-select-trigger" role="combobox" aria-labelledby={id+'-label'} aria-expanded={open} aria-controls={id} aria-haspopup="listbox" onClick={()=>{setOpen(!open);setQuery('');onSearch?.('');}}>{selected?.label||'Выберите сотрудника'}<span aria-hidden="true">⌄</span></button>
  {open&&<div className="search-select-popup"><input ref={input} aria-label={'Поиск: '+label} placeholder={placeholder} value={query} onChange={e=>{setQuery(e.target.value);onSearch?.(e.target.value);}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();root.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus();}}}/>
   <div role="listbox" aria-labelledby={id+'-label'} id={id} className="search-select-options">
    {query.trim().length<minimum?<p>Введите хотя бы {minimum} буквы.</p>:loading?<p role="status">Поиск…</p>:visible.length?visible.map(o=><button type="button" role="option" aria-selected={o.id===value} key={o.id} onClick={()=>choose(o)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=e.key==='ArrowDown'?e.currentTarget.nextElementSibling:e.currentTarget.previousElementSibling;(next as HTMLElement)?.focus();}}}><span>{o.label}</span>{o.detail&&<small>{o.detail}</small>}</button>):<p>Ничего не найдено.</p>}
   </div>
  </div>}
 </div>;
}
