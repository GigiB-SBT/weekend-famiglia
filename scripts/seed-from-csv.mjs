#!/usr/bin/env node
// Converte data/seed_attivita_bologna.csv in:
//  - src/data/seed-activities.json (usato dalla modalità demo dell'app)
//  - supabase/seed.sql (insert idempotenti per Supabase)
// Uso: npm run seed
import { readFileSync, writeFileSync } from "node:fs";

const CSV = "data/seed_attivita_bologna.csv";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const num = (v) => (v === "" || v == null ? null : Number(v));
const bool = (v) => (v === "true" ? true : v === "false" ? false : null);

const raw = parseCsv(readFileSync(CSV, "utf8").replace(/^﻿/, ""));
const activities = raw.map((r) => ({
  slug: r.slug,
  title: r.title,
  category: r.category,
  description: r.description,
  minAge: Number(r.min_age),
  maxAge: Number(r.max_age),
  multiAgeNote: r.multi_age_note,
  setting: r.setting,
  weatherFit: r.weather_fit,
  costBand: r.cost_band,
  priceNote: r.price_note,
  durationMin: num(r.duration_min),
  bookingRequired: bool(r.booking_required),
  address: r.address,
  zone: r.zone,
  lat: num(r.lat),
  lng: num(r.lng),
  openingNote: r.opening_note,
  sourceUrl: r.source_url,
  status: r.status || "da_verificare",
  isDemo: r.is_demo !== "false",
  lastChecked: r.last_checked || null,
}));

writeFileSync("src/data/seed-activities.json", JSON.stringify(activities, null, 2) + "\n");

const q = (v) => (v == null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const sql = [
  "-- Generato da scripts/seed-from-csv.mjs — attività demo da verificare",
  ...activities.map(
    (a) =>
      `insert into activities (slug,title,category,description,min_age,max_age,multi_age_note,setting,weather_fit,cost_band,price_note,duration_min,booking_required,opening_note,source_url,status,is_demo,last_checked) values (${[
        q(a.slug), q(a.title), q(a.category), q(a.description), a.minAge, a.maxAge, q(a.multiAgeNote),
        q(a.setting), q(a.weatherFit), q(a.costBand), q(a.priceNote), a.durationMin ?? "null",
        a.bookingRequired ?? "null", q(a.openingNote), q(a.sourceUrl), q(a.status), a.isDemo, q(a.lastChecked),
      ].join(",")}) on conflict (slug) do nothing;`,
  ),
].join("\n");
writeFileSync("supabase/seed.sql", sql + "\n");

console.log(`OK: ${activities.length} attività → src/data/seed-activities.json, supabase/seed.sql`);
