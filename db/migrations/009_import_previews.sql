CREATE TABLE room_import_previews(id text PRIMARY KEY,actor_id text NOT NULL,changes jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz);
ALTER TABLE rooms ADD COLUMN auto_classified boolean NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN classification_confidence text NOT NULL DEFAULT 'unknown' CHECK(classification_confidence IN ('high','medium','low','unknown'));
ALTER TABLE rooms ADD COLUMN needs_review boolean NOT NULL DEFAULT true;
