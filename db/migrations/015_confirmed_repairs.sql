CREATE TABLE quarantine_resolutions (
 quarantine_id text PRIMARY KEY REFERENCES migration_quarantine(id),
 action text NOT NULL,
 evidence text NOT NULL,
 result jsonb NOT NULL,
 resolved_by text NOT NULL,
 resolved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER quarantine_resolution_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON quarantine_resolutions FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TABLE room_area_corrections (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 room_id text NOT NULL REFERENCES rooms(id),
 before_value jsonb NOT NULL,
 after_value jsonb NOT NULL,
 reason text NOT NULL,
 actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER room_area_correction_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON room_area_corrections FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
