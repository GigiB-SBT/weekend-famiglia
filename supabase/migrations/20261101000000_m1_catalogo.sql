-- M1-lite — Catalogo e dati pilota (Weekend in Famiglia, Bologna)
-- Nessun login utente: famiglie/raccomandazioni/feedback accessibili solo via service role.

create extension if not exists pgcrypto;

create type content_status as enum ('draft', 'da_verificare', 'published', 'archived');
create type activity_category as enum ('museo','natura','fattoria','sport','laboratorio','scienza','biblioteca','gita');
create type activity_setting as enum ('indoor','outdoor','mixed');
create type weather_fit as enum ('any','dry_only','rain_ok');
create type cost_band as enum ('free','low','mid','high');
create type family_budget as enum ('free','upto20','20to50','over50');
create type setting_pref as enum ('indoor','outdoor','any');

create table content_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  kind text not null default 'website', -- website | comune | newsletter | social
  notes text,
  created_at timestamptz not null default now()
);

create table places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  zone text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category activity_category not null,
  description text not null default '',
  min_age smallint not null check (min_age between 0 and 17),
  max_age smallint not null check (max_age between 0 and 17),
  multi_age_note text not null default '',
  setting activity_setting not null,
  weather_fit weather_fit not null default 'any',
  cost_band cost_band not null,
  price_note text not null default '',
  duration_min integer,
  booking_required boolean,
  place_id uuid references places(id) on delete set null,
  opening_note text not null default '',
  source_id uuid references content_sources(id) on delete set null,
  source_url text not null,
  status content_status not null default 'da_verificare',
  is_demo boolean not null default false,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_age <= max_age)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references activities(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  min_age smallint not null check (min_age between 0 and 17),
  max_age smallint not null check (max_age between 0 and 17),
  setting activity_setting not null,
  cost_band cost_band not null,
  place_id uuid references places(id) on delete set null,
  source_url text not null,
  status content_status not null default 'da_verificare',
  last_checked date,
  created_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (min_age <= max_age)
);

-- Famiglie pilota: niente nomi né date di nascita dei minori.
create table families (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  consent_at timestamptz not null,
  ok_chiamata boolean not null default false,
  zone text not null,
  lat double precision,
  lng double precision,
  radius_km smallint not null default 10 check (radius_km between 1 and 50),
  children_ages smallint[] not null check (
    cardinality(children_ages) between 1 and 8
    and 0 <= all(children_ages) and 17 >= all(children_ages)
  ),
  budget family_budget not null default 'upto20',
  preference setting_pref not null default 'any',
  interests activity_category[] not null default '{}',
  active boolean not null default true,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  weekend_date date not null, -- sabato del weekend
  weather jsonb not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','skipped')),
  approved_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (family_id, weekend_date) -- anti-duplicato: una mail per famiglia per weekend
);

create table recommendation_items (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  position smallint not null check (position between 1 and 4), -- 4 = piano B
  activity_id uuid references activities(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  is_plan_b boolean not null default false,
  compatibility text not null check (compatibility in ('all_children','adaptable','partial')),
  score numeric(5,3) not null,
  distance_km numeric(6,2),
  unique (recommendation_id, position),
  check (activity_id is not null or event_id is not null)
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  answer text not null, -- es. 'done_1', 'maybe', 'none'
  note text,
  received_at timestamptz not null default now()
);

create index on activities (status, category);
create index on events (status, starts_on, ends_on);
create index on recommendations (weekend_date, status);

-- RLS
alter table content_sources enable row level security;
alter table places enable row level security;
alter table activities enable row level security;
alter table events enable row level security;
alter table families enable row level security;
alter table recommendations enable row level security;
alter table recommendation_items enable row level security;
alter table feedback enable row level security;

-- Catalogo leggibile pubblicamente solo se published. Nessuna policy = solo service role.
create policy activities_public_read on activities for select to anon, authenticated using (status = 'published');
create policy events_public_read on events for select to anon, authenticated using (status = 'published');
create policy places_public_read on places for select to anon, authenticated using (true);
