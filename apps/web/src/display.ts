// Preserve imported codes in storage; shorten only legacy drawing labels in the UI.
export function placeLabel(code:unknown){
 const value=String(code??'');
 const match=value.match(/^t_l?\d+_(\d+)$/i);
 return match?'Место '+match[1]:/^LEGACY-/i.test(value)?'Рабочее место':value||'Рабочее место';
}
