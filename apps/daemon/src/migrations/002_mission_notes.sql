-- Forward-only column. Existing mission rows from v1 survive unchanged.
ALTER TABLE missions ADD COLUMN notes TEXT;
