# Legacy Office Map API — evidence 2026-10-15

Endpoint: `/local/modules/adict.office_map/ajax.php`. Saved api.js uses POST with JSON body `{action,params}`; params is an ordered array. It does not explicitly add Content-Type, CSRF or Authorization headers. Same-origin browser credentials are implicit. This is observed frontend behavior, not proof that the server lacks CSRF validation. Never replay writes against production.

Response envelope: STATUS=OK and RESULT, otherwise ERROR is thrown. HTTP failures/non-JSON responses can fail before envelope handling. The complete list **found in the saved frontend corpus** is seven actions; undocumented server actions cannot be enumerated without backend source.

|Action|Mode|params|RESULT consumed by frontend|Source|
|---|---|---|---|---|
|getEditorData|read|[levelId]|canvas, templates, items; reload reads items|office-level-editor--state.js:402; captured geometry|
|getPopupData|read|[tableNum]|popup markup/data passed to popup controller; not a guaranteed structured employee record|ctrl.js:14|
|searchUser|read|[text]|array of employee search records|api.js:35; live read-only observation|
|attachUserToTable|write|[userId,tableId,true]|array of changed items; each passed to setItem|office-level-editor--state.js:186|
|detachUserFromTable|write|[userId,tableId]|one changed item passed to setItem|office-level-editor--state.js:166|
|detachUser|write|[id]|caller-dependent; no live write verification|api.js:39|
|saveObjects|write|[levelId,canvas.rawItems]|object with items replacing local list|office-level-editor--state.js:408–414|

Live searchUser: query with no matches returned []; another query returned 100 records. Fields observed: id:number, name:string, position:string, haveTable:boolean, tableNum:object (nullable/array/object subtype not established). No department, subtitle or office field observed. 100 records does not prove a documented maximum. Names, IDs and query response values are excluded from this evidence. Observation was via the page API and browser console, not an exported HAR.

Attach/detach require frontend useAttach flag. Existing table IDs must be positive; new negative temporary IDs change local owner data until save. The meaning of the third attach argument is not established beyond literal true. Do not invent a server-side override policy from it. saveObjects submits the entire rawItems array, not a delta; removals are represented by removing items from that array. Backend deletion/validation/transaction semantics remain unknown. Transform fields used by canvas include x/y/r; templates are referenced by tpl; id/tempId support temporary identity. Do not assert that this is the exhaustive accepted server schema.

Observed frontend defect: setItem uses `if(index)` after findIndex, so index 0 and -1 are handled incorrectly. New implementation must not copy this logic. Authorization flags in frontend are not proof of backend enforcement.

Errors: captured getEditorData STATUS=FAIL / «Этаж не найден»; HTTP 502 for 296125 in prior capture. Other business error messages and limits cannot be inferred safely from the generic ERROR handler.
