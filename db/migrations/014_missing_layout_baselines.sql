-- Record current observed state only; never reconstruct or overwrite earlier history.
INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by)
SELECT 'baseline-'||gen_random_uuid()::text,f.id,f.version,
 jsonb_build_object('floor',to_jsonb(f),
 'rooms',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM rooms r WHERE r.floor_id=f.id),'[]'::jsonb),
 'furniture',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM furniture x WHERE x.floor_id=f.id),'[]'::jsonb)),
 'Observed baseline; earlier history unavailable','migration'
FROM floors f WHERE NOT EXISTS(SELECT 1 FROM layout_versions v WHERE v.floor_id=f.id AND v.version=f.version);
