CREATE TABLE room_area_history (id text PRIMARY KEY,room_id text NOT NULL REFERENCES rooms,area_m2 numeric CHECK(area_m2>=0 AND area_m2<=10000000),valid_from date NOT NULL,valid_to date,source text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(valid_to IS NULL OR valid_to>valid_from),UNIQUE(room_id,valid_from));
CREATE UNIQUE INDEX room_area_current ON room_area_history(room_id) WHERE valid_to IS NULL;
CREATE INDEX room_area_period ON room_area_history(room_id,valid_from,valid_to);
INSERT INTO room_area_history(id,room_id,area_m2,valid_from,source,created_by) SELECT 'baseline-'||id,id,area_m2,CURRENT_DATE,'migration baseline, earlier validity unknown','migration' FROM rooms;
