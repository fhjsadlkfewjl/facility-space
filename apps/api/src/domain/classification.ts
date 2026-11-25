const rules:[string,RegExp][]=[
 ['server_room',/сервер|server|кроссов/iu],['restroom',/сануз|туалет|сан\.\s*уз|restroom|\bwc\b/iu],
 ['kitchen',/кухн|kitchen|при[её]ма пищи/iu],['meeting_room',/переговор|совещан|конференц|meeting/iu],
 ['corridor',/коридор|corridor|проход/iu],['lobby',/холл|вестибюл|лобби|lobby/iu],
 ['storage',/склад|кладов|storage|архив/iu],['break_room',/отдых|recreation|break room/iu],
 ['technical',/венткамер|щитовая|электрощит|бойлер|техническ|technical/iu],
 ['parking',/парков|паркинг|гараж|parking/iu],['outdoor',/террас|двор|открытая территор|outdoor/iu],
 ['open_space',/open[ -]?space|опенспейс|открытый офис/iu],['office',/кабинет|офис|office/iu]
];
export function classifyRoom(name:string,hasWorkplace=false){
 const hits=rules.filter(([,r])=>r.test(name)).map(([s])=>s);
 const subtype=hits.length===1?hits[0]:hits.length===0&&hasWorkplace?'office':'other';
 const confidence=hits.length===1?'high':hits.length===0&&hasWorkplace?'medium':'unknown';
 return {space_type_id:'standard_'+subtype,auto_classified:true,classification_confidence:confidence,needs_review:true};
}
