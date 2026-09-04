-- Migration 024: Add social links (linkedin, github) to profiles
-- Approved in Phase 10 implementation plan

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin VARCHAR(255),
  ADD COLUMN IF NOT EXISTS github VARCHAR(255);
