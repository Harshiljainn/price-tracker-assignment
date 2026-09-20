-- server/migrations/002_add_quantity.sql
-- Add optional quantity column to price_history
-- This stores the actual unit count extracted from the stock badge text (e.g. "73 left")

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- Note: NULL means quantity was not specified by the store (e.g. "In Stock" with no count)
-- A specific integer value means the store reported that exact count
-- Out-of-stock records will have in_stock=false; quantity remains NULL
