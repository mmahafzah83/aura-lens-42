-- Enable pgvector in public schema
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

-- Add embedding columns
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);