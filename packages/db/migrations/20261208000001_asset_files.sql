-- migrate:up

-- Uploaded files for assets (cover art, masters, stems, lyrics, press photos, documents). The file
-- lives in private storage under `storage_key`; an asset is ready once its upload is confirmed.
ALTER TABLE assets
  ADD COLUMN file_name    text CHECK (file_name IS NULL OR length(btrim(file_name)) BETWEEN 1 AND 255),
  ADD COLUMN size_bytes   bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 2147483648),
  ADD COLUMN content_type text CHECK (content_type IS NULL OR length(content_type) <= 120),
  ADD COLUMN uploaded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT assets_ready_has_file CHECK (storage_key IS NULL OR NOT ready OR size_bytes IS NOT NULL);

-- migrate:down
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_ready_has_file,
  DROP COLUMN IF EXISTS uploaded_by, DROP COLUMN IF EXISTS content_type, DROP COLUMN IF EXISTS size_bytes, DROP COLUMN IF EXISTS file_name;
