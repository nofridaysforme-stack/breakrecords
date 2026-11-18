-- migrate:up

-- A phone number for anyone in the workspace (the SoundExchange Letter of Direction asks for the
-- payee's). Entered on the person's page, like their legal name, PRO, IPI and address.
ALTER TABLE parties ADD COLUMN phone text CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 3 AND 40);

-- migrate:down
ALTER TABLE parties DROP COLUMN IF EXISTS phone;
