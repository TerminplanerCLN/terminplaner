-- =====================================================================
-- Werpfährtmich? — Supabase-Datenbankschema
-- =====================================================================
-- So verwendest du diese Datei:
--   1. In Supabase: linke Seitenleiste -> "SQL Editor" -> "New query"
--   2. Den GESAMTEN Inhalt dieser Datei einfügen und "Run" klicken.
-- Das Skript legt alle Tabellen an, aktiviert Sicherheitsregeln
-- (Row Level Security) und erstellt den Storage-Bucket für Dokumente.
-- Es ist so geschrieben, dass ein erneuter Durchlauf keine Fehler wirft.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. SAUBERER START
-- Entfernt evtl. aus einem frueheren (unvollstaendigen) Durchlauf
-- vorhandene Tabellen, damit das Skript garantiert sauber durchlaeuft.
-- Bei der ERSTEINRICHTUNG gehen dabei keine echten Daten verloren.
-- Wenn du bereits Echtdaten hast, die du behalten willst, entferne
-- diesen Block (Zeilen bis "-- 1. PROFILE") vor dem Ausfuehren!
-- ---------------------------------------------------------------------
drop table if exists public.offers cascade;
drop table if exists public.requests cascade;
drop table if exists public.profiles cascade;

-- ---------------------------------------------------------------------
-- 1. PROFILE
-- Jeder angemeldete Nutzer hat genau eine Profilzeile. Ein Nutzer kann
-- gleichzeitig Reiter UND Fahrer sein (beide Flags koennen true sein).
-- Die id entspricht der auth.users-id von Supabase.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  is_rider boolean not null default true,
  is_driver boolean not null default false,

  -- Standort (fuer Umkreissuche)
  location_label text,
  location_lat double precision,
  location_lng double precision,

  -- Reiter: Rating (Durchschnitt aus Fahrer-Bewertungen)
  rider_rating numeric(3,2),
  rider_trips integer not null default 0,

  -- Fahrer: Rating (Durchschnitt aus Reiter-Bewertungen)
  driver_rating numeric(3,2),
  driver_trips integer not null default 0,

  -- Fahrer: Fahrzeug & Anhaenger
  vehicle_make text,
  vehicle_model text,
  vehicle_trailer text,
  vehicle_capacity integer default 2,
  vehicle_plate text,

  -- Fahrer: Preise & Umkreis
  price_per_km numeric(6,2) default 1.5,
  base_price numeric(6,2) default 15,
  max_radius_km integer default 40,

  -- Fahrer: Verfuegbarkeit (Wochentage + Zeitfenster)
  av_mon boolean default true,
  av_tue boolean default true,
  av_wed boolean default true,
  av_thu boolean default true,
  av_fri boolean default true,
  av_sat boolean default false,
  av_sun boolean default false,
  av_from text default '08:00',
  av_to text default '18:00',

  -- Fahrer: akzeptierte Zahlungsarten
  pay_cash boolean default true,
  pay_card boolean default false,
  pay_invoice boolean default false,

  -- Fahrer: Dokumente (Pfade im Storage-Bucket, nicht die Dateien selbst)
  doc_license_path text,
  doc_license_name text,
  doc_permit_path text,
  doc_permit_name text,

  -- Reiter: Pferd
  horse_name text,
  horse_breed text,
  horse_height integer,
  horse_weight integer,
  horse_temperament text,
  horse_loading_ok boolean default true,
  horse_notes text,

  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. ANFRAGEN (requests)
-- Ein Reiter schreibt eine Transportanfrage aus.
-- ---------------------------------------------------------------------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles(id) on delete cascade,

  pickup_label text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_label text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,

  when_ts timestamptz not null,
  urgent boolean not null default false,
  horse_count integer not null default 1,
  loading_help boolean not null default false,

  -- gecachte Route (einmal berechnet, spart Routing-API-Aufrufe)
  route_km numeric(7,1) not null,
  route_minutes integer,
  route_line jsonb,           -- Polyline als [[lat,lng], ...]

  -- open -> assigned -> done
  status text not null default 'open',
  accepted_offer_id uuid,

  created_at timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests(status);
create index if not exists requests_rider_idx on public.requests(rider_id);

-- ---------------------------------------------------------------------
-- 3. ANGEBOTE (offers)
-- Ein Fahrer gibt aktiv ein Angebot auf eine Anfrage ab.
-- ---------------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,

  price numeric(8,2) not null,
  price_per_km numeric(6,2) not null,
  base_price numeric(6,2) not null,
  route_km numeric(7,1) not null,

  -- pending -> accepted | on_hold | rejected
  status text not null default 'pending',

  accepted_at timestamptz,
  cancel_window_ms integer not null default 600000,   -- 10 Minuten live
  cancelled_by text,
  cancelled_at timestamptz,

  rider_completed boolean not null default false,
  driver_completed boolean not null default false,
  completed_at timestamptz,

  rating_by_rider_stars integer,
  rating_by_rider_comment text,
  rating_by_rider_at timestamptz,
  rating_by_driver_stars integer,
  rating_by_driver_comment text,
  rating_by_driver_at timestamptz,

  created_at timestamptz not null default now(),

  -- Ein Fahrer kann pro Anfrage nur EIN Angebot abgeben.
  unique (request_id, driver_id)
);
create index if not exists offers_request_idx on public.offers(request_id);
create index if not exists offers_driver_idx on public.offers(driver_id);

-- ---------------------------------------------------------------------
-- 4. Profil automatisch anlegen, sobald sich ein Nutzer registriert
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'phone', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- Ohne diese Regeln koennte jeder alle Daten aendern. Mit ihnen darf
-- jeder nur das lesen/schreiben, was ihm zusteht.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.offers   enable row level security;

-- --- PROFILE ---
-- Jeder eingeloggte Nutzer darf alle Profile LESEN (noetig, damit Reiter
-- die Fahrer-Reputation sehen und umgekehrt). Aendern nur das eigene.
drop policy if exists "Profile lesbar fuer eingeloggte" on public.profiles;
create policy "Profile lesbar fuer eingeloggte"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "Eigenes Profil aendern" on public.profiles;
create policy "Eigenes Profil aendern"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Eigenes Profil anlegen" on public.profiles;
create policy "Eigenes Profil anlegen"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

-- --- ANFRAGEN ---
-- Offene Anfragen sind fuer alle eingeloggten Nutzer sichtbar (Fahrer
-- brauchen das). Eigene Anfragen sieht der Reiter immer.
drop policy if exists "Anfragen lesbar" on public.requests;
create policy "Anfragen lesbar"
  on public.requests for select
  to authenticated using (true);

drop policy if exists "Reiter erstellt eigene Anfrage" on public.requests;
create policy "Reiter erstellt eigene Anfrage"
  on public.requests for insert
  to authenticated with check (auth.uid() = rider_id);

-- Anfrage aendern duerfen: der Reiter (Eigentuemer) ODER ein Fahrer, der
-- ein Angebot auf diese Anfrage hat (noetig fuer Statuswechsel bei
-- Annahme/Storno/Abschluss).
drop policy if exists "Anfrage aenderbar durch Beteiligte" on public.requests;
create policy "Anfrage aenderbar durch Beteiligte"
  on public.requests for update
  to authenticated using (
    auth.uid() = rider_id
    or exists (select 1 from public.offers o where o.request_id = requests.id and o.driver_id = auth.uid())
  );

-- --- ANGEBOTE ---
-- Sichtbar fuer den anbietenden Fahrer UND den Reiter der Anfrage.
drop policy if exists "Angebote lesbar fuer Beteiligte" on public.offers;
create policy "Angebote lesbar fuer Beteiligte"
  on public.offers for select
  to authenticated using (
    auth.uid() = driver_id
    or exists (select 1 from public.requests r where r.id = offers.request_id and r.rider_id = auth.uid())
  );

drop policy if exists "Fahrer gibt eigenes Angebot ab" on public.offers;
create policy "Fahrer gibt eigenes Angebot ab"
  on public.offers for insert
  to authenticated with check (auth.uid() = driver_id);

-- Angebot aendern duerfen Fahrer (eigenes) und der Reiter der Anfrage
-- (fuer Annahme, Storno, Abschluss, Bewertung).
drop policy if exists "Angebot aenderbar durch Beteiligte" on public.offers;
create policy "Angebot aenderbar durch Beteiligte"
  on public.offers for update
  to authenticated using (
    auth.uid() = driver_id
    or exists (select 1 from public.requests r where r.id = offers.request_id and r.rider_id = auth.uid())
  );

-- =====================================================================
-- 6. STORAGE-BUCKET fuer Dokumente (Fuehrerschein, Transport-Erlaubnis)
-- Privater Bucket: Dateien sind nur ueber zeitlich begrenzte, signierte
-- Links abrufbar, nicht oeffentlich im Netz.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Fahrer darf nur in seinen eigenen Ordner (documents/<user-id>/...) laden.
drop policy if exists "Eigene Dokumente hochladen" on storage.objects;
create policy "Eigene Dokumente hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Eigene Dokumente aktualisieren" on storage.objects;
create policy "Eigene Dokumente aktualisieren"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lesen: jeder eingeloggte Nutzer darf Dokumente abrufen (Reiter muss die
-- Dokumente des Fahrers pruefen koennen). Der Bucket bleibt privat, Zugriff
-- laeuft ueber signierte Links, die die App erzeugt.
drop policy if exists "Dokumente lesbar fuer eingeloggte" on storage.objects;
create policy "Dokumente lesbar fuer eingeloggte"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

-- =====================================================================
-- Fertig. Naechster Schritt: In der App js/config.js die Projekt-URL und
-- den anon-Key eintragen (siehe README.md).
-- =====================================================================
