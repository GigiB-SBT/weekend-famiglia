-- Stagionalità (es. raccolta castagne 9-11) e area servita.
alter table activities add column if not exists season_months smallint[]
  check (season_months is null or (1 <= all(season_months) and 12 >= all(season_months)));
alter table families add column if not exists area text not null default 'bologna'
  check (area in ('bologna', 'grottammare'));
alter table events add column if not exists area text not null default 'bologna'
  check (area in ('bologna', 'grottammare'));
-- Gite di giornata in Appennino: raggio fino a 100 km.
alter table families drop constraint if exists families_radius_km_check;
alter table families add constraint families_radius_km_check check (radius_km between 1 and 100);
