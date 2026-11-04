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
- Versione: ogni APK ha `versionCode` = numero del run GitHub (hook `capacitor:sync:after` → `scripts/android-version.mjs`), quindi si installa come aggiornamento.
- Firma stabile: `signing/debug.keystore` (chiave di debug del progetto, installata in CI da `scripts/ci-signing.mjs`), così ogni nuovo APK si installa sopra il precedente senza perdere i dati.
- Icona e splash: `assets/` (generati con `@capacitor/assets` in CI). La cartella `android/` è generata e non va committata.

## Eventi (feste di parrocchia, agende online)

- **Scheda Eventi** nell'app: coda *Da approvare* (eventi trovati online), *In programma*, **+ Aggiungi evento** con lettura del testo di volantini e messaggi WhatsApp (data, ora, tipo, costo, età).
- Gli eventi approvati entrano nelle proposte del loro weekend con priorità sulle attività fisse e compaiono nella mail come "Solo questo weekend".
- Gli eventi sono salvati sul telefono in modo durevole (`src/lib/persist.ts`: localStorage + Android Preferences): **aggiornare l'app li conserva**. Disinstallarla li cancella: prima usare *Backup eventi*. In fase E2 passano su Supabase.
- **Importa eventi dalla mail**: la mail del mercoledì contiene un «Codice eventi»; incollato nella scheda Eventi aggiunge i nuovi candidati senza reinstallare l'APK. La scheda mostra «Eventi online aggiornati …».
- **Filtro zona** nella scheda Eventi: tutta l'area oppure una zona con raggio 5-80 km.
- **Lettura automatica**: `.github/workflows/eventi-settimanali.yml`, ogni mercoledì. Legge l'open data "Agenda Cultura" del Comune (`scripts/fetch-events.mjs`, fonti in `data/event-sources.json`), salva i candidati in `src/data/event-candidates.json`, apre una issue "N eventi da approvare" (GitHub la invia per email) e ricostruisce l'APK.
- L'Agenda Cultura esclude sagre ed eventi religiosi. Per questo lo script controlla anche **fonti locali** (`type: "page"` in `data/event-sources.json`): siti di parrocchie (anche i PDF degli avvisi), Pro Loco, Comuni limitrofi. Cerca castagnate, feste, sagre, tombole, mercatini e spettacoli con una data (`scripts/lib/local-pages.mjs`). La mail settimanale mostra quali fonti hanno risposto.
- **Aggiungere una fonte**: su GitHub apri `data/event-sources.json`, matita, copia un blocco `"type": "page"` e cambia `id`, `name`, `url`, `lat`/`lng`. Censimenti in `docs/FONTI_EVENTI.md`, `docs/FONTI_LOCALI.md` e `data/parrocchie-zona-censimento.json`. Per i siti delle zone pastorali (`*.chiesadibologna.it`) lo script apre anche gli ultimi articoli (`followLinks`).
- Feste solo su volantini, WhatsApp o Facebook: **+ Aggiungi evento** nell'app.
- **Promemoria** (solo app Android): mercoledì 18:30 eventi da approvare, venerdì 9:00 rivedi la mail. Si attivano dalla scheda Eventi.

## Sezione Adulti

- Scheda **Adulti**: eventi del weekend (venerdì-domenica) o dei prossimi 15 giorni per adulti: Cultura, Concerti live, Teatro e spettacoli, Notte, Gusto, Sagre e feste, All'aria aperta. Filtri per area, zona/raggio e tipo; stellina per salvarli (salvati in modo durevole).
- Fonte: gli eventi dell'Agenda Cultura **non** per bambini (prima scartati) → `src/data/event-adults.json`, più sagre e feste (`audience: "tutti"`). Nessuna approvazione: sono marcati «da verificare».
- `audience` sugli eventi: `famiglie` | `adulti` | `tutti`. Gli eventi `adulti` non entrano mai nelle proposte per le famiglie. Nel form «Aggiungi evento» c'è «Per chi».
- Il codice eventi della mail include anche gli adulti in forma compatta (limite ~52.000 caratteri per stare nella issue GitHub).

### Notte (locali, club, concerti)

- Tipo **Notte** nella scheda Adulti (dj set, serate, club) accanto a Musica e spettacoli.
- Fonti con `"mode": "venue"`: programmi dei locali e pagine concerti (`scripts/lib/local-pages.mjs` → `extractVenueEvents`): ogni voce con una data esplicita è un evento; il titolo è sulla stessa riga o accanto (l'impaginazione titolo-prima/dopo-la-data è rilevata da sola).
- Bologna: Locomotiv, Freakout, Bravo Caffè (pagine zero.eu), Covo Club, Bologna Welcome «Musica e danza». Riviera: Songkick area Ascoli/San Benedetto, PalaRiviera, Il Tacco di Bacco San Benedetto. Censimento in `data/notte-fonti-censimento.json`.
- Non usati: Xceed, Bandsintown, DICE (richiedono JavaScript), Resident Advisor (termini da verificare), Eventbrite (date relative senza anno).
- **Concerti live** (tipo a parte, generi riconosciuti a parola intera): Songkick area Bologna (3 pagine), Unipol Arena, Estragon, Europauditorium, Teatro Duse, TicketOne Bologna, Teatro Comunale, Tacco di Bacco Imola; Riviera: Songkick Ascoli/San Benedetto, Fermo, Grottammare, TicketOne San Benedetto, Teatro Ventidio Basso, AllEvents Porto San Giorgio. Censimento in `data/concerti-fonti-censimento.json`.
- I locali della Riviera (Noa, Sabya Beach, Savana Beach, BB Disco Dinner, Flow Rock Live…) non hanno un programma online leggibile: si aggiungono a mano con «Aggiungi evento» → tipo «Serata / club / dj set», Per chi «Solo adulti».

## Esplora (ovunque, con GPS)

- Scheda **Esplora**: funziona in qualsiasi località, non solo nelle due aree. «Vicino a me» usa il GPS (`@capacitor/geolocation`, permessi aggiunti da `scripts/android-version.mjs`); oppure si scrive una città (geocoding Open-Meteo, solo Italia).
- Per la località scelta: meteo del weekend; **dal nostro elenco** (catalogo ed eventi entro il raggio); **luoghi vicini** da OpenStreetMap via Overpass (musei, parchi, zoo, castelli, teatri, club, cantine…; distanza, sito, mappa; © OpenStreetMap contributors, ODbL); **ricerche pronte** sul web con le date del weekend (eventi per bambini, sagre, concerti, mercatini…).
- Modo Famiglia / Adulti, raggio 5-50 km. **Preferiti** con la stellina; una località cercata almeno 2 volte viene proposta come preferita. Preferiti e cronologia sono salvati in modo durevole (`wf.places.*`).
- Codice: `src/lib/explore/` (geo, osm, websearch, places-store) e `src/app/explore-panel.tsx`.

## Aree, sagre, escursioni

- **Due aree**: Bologna e Grottammare (selettore in alto nell'app; meteo per area). Zone in `src/data/zones.ts`, comuni per la distanza in `data/comuni.json`.
- **Catalogo** = tutti i `data/seed_attivita_*.csv` (`npm run seed`): Bologna, escursioni colli/Appennino e castagneti, Grottammare. Colonna `season_months` (es. `9|10|11`): l'attività compare solo in quei mesi e, se dura al massimo 3 mesi, ha una piccola priorità.
- **Sagre e calendari provinciali**: fonti con `"listing": true, "geocode": true` (titolo, poi comune e date). Le date su più giorni ("dal 6 al 15 novembre", "6 November – 15 November 2026") sono riconosciute; il comune nel testo dà la distanza. Le pagine mensili usano `urlTemplate` con `{monthIt}`, `{monthEn}`, `{year}`. Si prendono solo i fatti (nome, comune, date) con link alla fonte; eventiesagre.it vieta la riproduzione e non è usato.
- **Distanze** 50 e 80 km per le gite in Appennino.

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
| E1b | Sagre, escursioni e castagneti stagionali, area Grottammare | Fatto (dati da verificare) |
| A1 | Sezione Adulti (cultura, musica, gusto, feste) | Fatto (dati da verificare) |
| E2 | Eventi su Supabase, notifica immediata | Da fare (serve account Supabase) |
