-- Convert company_settings id from INTEGER to UUID and enforce singleton pattern

-- 1. Drop the legacy integer check constraint
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_id_check;

-- 2. Safely convert the ID column to UUID
-- Using gen_random_uuid() during the ALTER command ensures any existing row (if any)
-- gets a valid UUID, preserving data without attempting an invalid integer-to-UUID cast.
ALTER TABLE public.company_settings 
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE UUID USING gen_random_uuid(),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Implement robust singleton behavior
-- We add a boolean column that must be true, and make it unique.
-- This guarantees exactly one row can exist in the table without relying on a magic ID.
ALTER TABLE public.company_settings 
  ADD COLUMN is_singleton BOOLEAN DEFAULT true NOT NULL,
  ADD CONSTRAINT company_settings_is_singleton_check CHECK (is_singleton);

CREATE UNIQUE INDEX company_settings_singleton_idx ON public.company_settings (is_singleton);