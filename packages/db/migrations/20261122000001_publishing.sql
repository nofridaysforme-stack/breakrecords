-- migrate:up

-- The publishing module. An agreement says what kind it is, so a filing can check that the
-- workspace may register a writer's songs (rule PUB-02):
--  * publishing: the label owns the publisher share; co_publishing: the label and writer share
--    it; administration: the writer keeps ownership and the label registers and collects for a fee.
--  * territory: where it applies ("Worldwide", or "Worldwide except Japan" when a foreign
--    sub-publisher covers the rest); starts_on / ends_on: the term (open-ended when empty).
--  * admin_fee_bp: the administrator's fee; publisher_share_bp: the label's part of the song's
--    publishing income under the deal.
ALTER TABLE agreements
  ADD COLUMN kind text CHECK (kind IN ('artist', 'producer', 'feature', 'mix', 'split_sheet', 'distribution', 'publishing', 'co_publishing', 'administration', 'sync', 'other')),
  ADD COLUMN territory text CHECK (territory IS NULL OR length(btrim(territory)) > 0),
  ADD COLUMN starts_on date,
  ADD COLUMN ends_on date CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on > starts_on),
  ADD COLUMN admin_fee_bp integer CHECK (admin_fee_bp BETWEEN 0 AND 5000),
  ADD COLUMN publisher_share_bp integer CHECK (publisher_share_bp BETWEEN 0 AND 10000);

-- What existing agreements already are, from their template.
UPDATE agreements a SET kind = CASE t.slug
    WHEN 'artist' THEN 'artist' WHEN 'producer' THEN 'producer' WHEN 'feature' THEN 'feature' WHEN 'split' THEN 'split_sheet'
    WHEN 'publishing' THEN 'publishing' WHEN 'co-publishing' THEN 'co_publishing' WHEN 'admin' THEN 'administration' WHEN 'sync' THEN 'sync' ELSE 'other' END
  FROM contract_templates t WHERE t.id = a.template_id AND a.kind IS NULL;
UPDATE agreements SET kind = 'distribution' WHERE kind IS NULL AND source = 'third_party';

-- migrate:down
ALTER TABLE agreements DROP COLUMN IF EXISTS publisher_share_bp, DROP COLUMN IF EXISTS admin_fee_bp, DROP COLUMN IF EXISTS ends_on,
  DROP COLUMN IF EXISTS starts_on, DROP COLUMN IF EXISTS territory, DROP COLUMN IF EXISTS kind;
