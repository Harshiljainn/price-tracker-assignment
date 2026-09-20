-- Migration 004: Add global app_settings table for storing a single global alert email.
-- This replaces the per-product alert_email approach.

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
