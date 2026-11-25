ALTER TABLE floors ADD COLUMN scale_evidence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE floors ADD COLUMN background_provenance text NOT NULL DEFAULT 'unknown';
ALTER TABLE furniture_templates ADD COLUMN default_width double precision;
ALTER TABLE furniture_templates ADD COLUMN default_depth double precision;
ALTER TABLE furniture_templates ADD COLUMN dimensions_evidence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE workplaces ADD COLUMN code_provenance text NOT NULL DEFAULT 'source';
