CREATE TABLE room_classification_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 room_id text NOT NULL REFERENCES rooms(id),
 space_type_id text NOT NULL REFERENCES space_types(id),
 valid_from timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL DEFAULT 'observed database change'
);
CREATE INDEX room_classification_at ON room_classification_history(room_id,valid_from DESC,id DESC);
INSERT INTO room_classification_history(room_id,space_type_id,source)
 SELECT id,space_type_id,'migration baseline; earlier classification unknown' FROM rooms;
CREATE FUNCTION record_room_classification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.space_type_id IS DISTINCT FROM OLD.space_type_id THEN
  INSERT INTO room_classification_history(room_id,space_type_id) VALUES(NEW.id,NEW.space_type_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER room_classification_record AFTER INSERT OR UPDATE OF space_type_id ON rooms FOR EACH ROW EXECUTE FUNCTION record_room_classification();
CREATE TRIGGER room_classification_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON room_classification_history FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
