CREATE TABLE quality_reviews (
 category text NOT NULL,
 entity_id text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED','IGNORED')),
 comment text NOT NULL DEFAULT '',
 assigned_to text,
 reviewed_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 resolution_note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY(category,entity_id)
);
