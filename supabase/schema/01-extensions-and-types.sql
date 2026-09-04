-- 01 — extensions and types. Generated from the live catalog 2026-09-04.
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE public.account_type AS ENUM ('customer', 'staff', 'test', 'demo');
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.plan_type AS ENUM ('trial', 'free', 'paid');
CREATE TYPE public.seniority_band AS ENUM ('work', 'table', 'room');
