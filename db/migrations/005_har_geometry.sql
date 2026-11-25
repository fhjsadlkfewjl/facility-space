ALTER TABLE floors ADD COLUMN api_geometry_evidence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE furniture_templates ADD COLUMN api_geometry_evidence jsonb NOT NULL DEFAULT '{}';
