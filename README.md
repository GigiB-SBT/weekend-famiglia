# Weekend in Famiglia — Bologna

Concierge tool per il test di dicembre: ogni venerdì una mail con 3 idee per il weekend in famiglia a Bologna, preparata e approvata a mano dal founder prima dell'invio.

Il perimetro è definito in [`docs/HANDOFF.md`](docs/HANDOFF.md) (decisione CdA 1/11/2026): è un *concierge tool*, non l'MVP completo. Nessun login utente, nessuna area admin.

> `CLAUDE.md` e `PROJECT_SPEC.md` sono forniti dal founder e non fanno parte di questo repository generato.

## Prerequisiti

- Node.js 20 o superiore
- Account Supabase (piano free)
- Account Vercel (piano Hobby) per il deploy

## Setup

```bash
npm install
cp .env.example .env.local   # poi compila i valori
npm run dev                  # http://localhost:3000
```

## Script

| Script | Descrizione |
| --- | --- |
| `npm run dev` | Server di sviluppo |
| `npm run build` | Build di produzione (funziona anche senza variabili d'ambiente) |
| `npm run start` | Avvia la build di produzione |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (TypeScript strict) |
| `npm run test` | Vitest (`vitest run`, ambiente node) |

## Variabili d'ambiente

Validate con zod in `src/lib/env.ts`, in modo lazy (solo al primo uso).

| Variabile | Obbligatoria | Note |
| --- | --- | --- |
| `SUPABASE_URL` | sì | URL del progetto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sì | Solo server, mai esposta al browser |
| `NEXT_PUBLIC_SITE_URL` | no | URL pubblico del sito |
| `EMAIL_PROVIDER`, `BREVO_API_KEY` / `RESEND_API_KEY`, `FOUNDER_EMAIL` | dopo | Previste per M4-lite, commentate in `.env.example` |

Il client Supabase (service role, solo server) è in `src/lib/supabase/server.ts`.

## Modalità demo

La home (`/`) funziona senza Supabase: legge il catalogo da `src/data/seed-activities.json` e usa 3 famiglie fittizie (`src/data/demo-families.ts`). Età dei figli, zona, raggio, budget e preferenza sono modificabili; il meteo arriva da Open-Meteo (con "simula sole/pioggia" per provare il piano B). L'anteprima mail è sola lettura: **nessun invio**.

## App Android (APK)

A ogni push su `main` la GitHub Action `.github/workflows/android-apk.yml` costruisce un APK di debug (Capacitor 8, export statico di Next in `out/`).

- Scarica: tab **Actions** → ultima esecuzione di **Android APK** → sezione **Artifacts** → `weekend-famiglia-apk` (zip con `app-debug.apk`).
- Installa sul telefono aprendo l'APK e consentendo "installa app sconosciute" per il browser o il file manager.
- In locale: `npm run build:mobile && npx cap add android && npx cap sync android` (serve Android Studio / JDK 21).
- Firma stabile: `signing/debug.keystore` (chiave di debug del progetto, installata in CI da `scripts/ci-signing.mjs`), così ogni nuovo APK si installa sopra il precedente senza perdere i dati.
- Icona e splash: `assets/` (generati con `@capacitor/assets` in CI). La cartella `android/` è generata e non va committata.

## Eventi (feste di parrocchia, agende online)

- **Scheda Eventi** nell'app: coda *Da approvare* (eventi trovati online), *In programma*, **+ Aggiungi evento** con lettura del testo di volantini e messaggi WhatsApp (data, ora, tipo, costo, età).
- Gli eventi approvati entrano nelle proposte del loro weekend con priorità sulle attività fisse e compaiono nella mail come "Solo questo weekend".
- Gli eventi sono salvati sul telefono (localStorage): usare *Backup eventi* prima di reinstallare. In fase E2 passano su Supabase.
- **Lettura automatica**: `.github/workflows/eventi-settimanali.yml`, ogni mercoledì. Legge l'open data "Agenda Cultura" del Comune (`scripts/fetch-events.mjs`, fonti in `data/event-sources.json`), salva i candidati in `src/data/event-candidates.json`, apre una issue "N eventi da approvare" (GitHub la invia per email) e ricostruisce l'APK.
- L'Agenda Cultura esclude sagre ed eventi religiosi: le parrocchie si aggiungono a mano. Censimento fonti in `docs/FONTI_EVENTI.md`.
- **Promemoria** (solo app Android): mercoledì 18:30 eventi da approvare, venerdì 9:00 rivedi la mail. Si attivano dalla scheda Eventi.

## Seed del catalogo

```bash
# data/seed_attivita_bologna.csv → src/data/seed-activities.json + supabase/seed.sql
npm run seed
```
Tutte le attività sono `da_verificare` e `is_demo = true`: vanno controllate a mano prima del primo invio. In produzione il motore usa solo `published`.

## Supabase

```bash
# dal SQL editor di Supabase, nell'ordine:
supabase/migrations/20261101000000_m1_catalogo.sql
supabase/seed.sql
```
RLS: il catalogo è leggibile solo se `published`; `families`, `recommendations`, `recommendation_items`, `feedback` solo via service role. Vincolo `unique (family_id, weekend_date)` come anti-duplicato degli invii.

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `src/lib/engine/` | Motore: filtri rigidi, score età/meteo/distanza, diversificazione, piano B (+ test caso 5-9-11) |
| `src/lib/weather/` | Adapter Open-Meteo con timeout e fallback (+ test) |
| `src/lib/mail/draft.ts` | Bozza testuale della mail del venerdì |
| `src/data/` | Seed, zone di Bologna (centroidi approssimati), famiglie demo |
| `supabase/` | Migration M1 e seed SQL |

## Stato milestone

| Milestone | Contenuto | Stato |
| --- | --- | --- |
| M0-lite | Setup: Next.js, TS strict, Tailwind, Supabase client, Vitest | Fatto |
| M1-lite | Catalogo: migrations, RLS, seed | Migration e seed SQL pronti, da applicare su Supabase |
| M2-lite | Motore di raccomandazione | Fatto (dati locali) |
| M3-lite | Meteo (Open-Meteo) | Fatto |
| M4-lite | Bozza mail del venerdì e invio dopo approvazione | Bozza fatta; invio, log e import CSV famiglie da fare |
| E1 | Eventi: aggiunta manuale, coda approvazione, lettura agende, promemoria | Fatto |
| E2 | Eventi su Supabase, notifica immediata | Da fare (serve account Supabase) |
