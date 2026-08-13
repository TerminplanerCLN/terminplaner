-- =====================================================================
-- Migration: Selbstauskunft (statt Dokument-Upload) + manueller
-- Gesamtpreis bei Angeboten.
-- Kann gefahrlos gegen eine bestehende Datenbank ausgeführt werden
-- (nutzt überall "if not exists" / "if not exists" -Varianten).
-- =====================================================================

-- ---- Fahrer: Selbstauskunft-Häkchen statt Dokument-Upload ----
alter table public.profiles add column if not exists decl_license boolean not null default false;
alter table public.profiles add column if not exists decl_vehicle boolean not null default false;
alter table public.profiles add column if not exists decl_eu_1_2005 boolean not null default false;
alter table public.profiles add column if not exists decl_trailer_insurance boolean not null default false;
alter table public.profiles add column if not exists declarations_at timestamptz;

comment on column public.profiles.decl_license is 'Fahrer bestätigt: gültige Fahrerlaubnis für das Gespann vorhanden';
comment on column public.profiles.decl_vehicle is 'Fahrer bestätigt: Fahrzeug und Anhänger verkehrssicher';
comment on column public.profiles.decl_eu_1_2005 is 'Fahrer bestätigt: Nachweise nach EU-Tiertransportverordnung (EG) Nr. 1/2005 vorhanden, falls erforderlich';
comment on column public.profiles.decl_trailer_insurance is 'Fahrer bestätigt: Anhänger-Haftpflichtversicherung vorhanden';

-- ---- Angebote: Wahl zwischen Kilometerpreis und manuellem Gesamtpreis ----
alter table public.offers add column if not exists price_mode text not null default 'per_km';
alter table public.offers add column if not exists flat_price numeric(8,2);

comment on column public.offers.price_mode is '''per_km'' (automatisch aus Anfahrt + km) oder ''flat'' (vom Fahrer manuell eingegebener Gesamtpreis)';
comment on column public.offers.flat_price is 'Vom Fahrer eingegebener Gesamtpreis, nur relevant wenn price_mode = ''flat''';
