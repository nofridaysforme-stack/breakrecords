-- migrate:up

-- A form for each organization: PRO and MLC registrations for songs, SoundExchange
-- registration and Letter of Direction for recordings, and the Copyright Office album group.
ALTER TYPE doc_kind ADD VALUE IF NOT EXISTS 'pro_registration';
ALTER TYPE doc_kind ADD VALUE IF NOT EXISTS 'mlc_registration';
ALTER TYPE doc_kind ADD VALUE IF NOT EXISTS 'sx_registration';
ALTER TYPE doc_kind ADD VALUE IF NOT EXISTS 'sx_lod';
ALTER TYPE doc_kind ADD VALUE IF NOT EXISTS 'copyright_group';

-- migrate:down
-- Enum values can't be dropped; the forms that use them are removed with the next migration's down.
