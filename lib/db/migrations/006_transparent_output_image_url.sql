-- Batch 6.1: cache transparent PNG downloads per render
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS transparent_output_image_url text;
