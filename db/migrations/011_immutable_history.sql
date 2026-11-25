CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER layout_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON layout_versions FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
