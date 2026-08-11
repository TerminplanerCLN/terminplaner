-- Werpfährtmich: Migration für Fahrer-Stornobedingungen, Angebots-Snapshot und Absagegründe
-- Für eine bereits bestehende Supabase-Instanz ausführen.

alter table public.profiles
  add column if not exists cancel_more48 text not null default 'free',
  add column if not exists cancel_24_48 text not null default 'free',
  add column if not exists cancel_6_24 text not null default 'base_fee',
  add column if not exists cancel_under6 text not null default 'base_fee',
  add column if not exists cancel_custom_text text not null default '';

alter table public.offers
  add column if not exists cancellation_policy jsonb,
  add column if not exists cancellation_category text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_mutual boolean not null default false;
