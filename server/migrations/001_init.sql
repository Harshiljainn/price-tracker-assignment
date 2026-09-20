-- server/migrations/001_init.sql

-- Enable UUID extension if not already enabled (Supabase typically has this)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    url TEXT NOT NULL UNIQUE,
    image_url TEXT,
    is_tracked BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. price_history table
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL,
    mrp NUMERIC,
    in_stock BOOLEAN,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. scrape_logs table
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- e.g., 'SUCCESS', 'FAILED'
    attempt INTEGER NOT NULL,
    message TEXT,
    duration_ms INTEGER,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
-- Index for finding a product by its URL quickly
CREATE INDEX IF NOT EXISTS idx_products_url ON products(url);

-- Index for retrieving price history chronologically for a specific product
CREATE INDEX IF NOT EXISTS idx_price_history_product_scraped_at ON price_history(product_id, scraped_at DESC);

-- Index for retrieving scrape logs by status for a specific product
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_status ON scrape_logs(product_id, status);
