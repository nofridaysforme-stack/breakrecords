-- migrate:up

-- Each form belongs to one kind of thing, and a Letter of Direction keeps the terms it was made
-- with (payee, percentage of the featured artist's share, effective date), so a new version
-- starts from them.
ALTER TABLE documents ADD CONSTRAINT documents_form_subject CHECK (
  subject = CASE kind
    WHEN 'pro_registration' THEN 'work'::doc_subject WHEN 'mlc_registration' THEN 'work'::doc_subject
    WHEN 'sx_registration' THEN 'recording'::doc_subject WHEN 'sx_lod' THEN 'recording'::doc_subject
    WHEN 'copyright_group' THEN 'release'::doc_subject ELSE subject END);
ALTER TABLE documents ADD COLUMN options jsonb CHECK (options IS NULL OR jsonb_typeof(options) = 'object');

-- migrate:down
ALTER TABLE documents DROP COLUMN IF EXISTS options;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_form_subject;
