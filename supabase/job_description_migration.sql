-- Platinum Hub — jobs get a free-text description
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Additive and safe to run any time; existing jobs just get description = null.

alter table public.jobs add column if not exists description text;
