# Weekend in Famiglia — Handoff per la sessione di sviluppo

_1 novembre 2026. Leggere insieme a `claude/weekend-famiglia-cda.md`._

## Decisione
- Il founder sviluppa con Claude come agente (Claude Code). Costi in denaro ~0-15 € per il test.
- **Perimetro = "concierge tool"**, non l'MVP completo della PROJECT_SPEC v1.0. Solo il codice che serve al test di dicembre e che resta nel prodotto finale.
- **Avvio dopo il 20/11** (test chiuso Unpiatto ha la precedenza). Prima mail: **venerdì 4/12**.
- Area: **solo Bologna**.

## Cosa costruire (in ordine)
1. **M0-lite — Setup:** Next.js App Router + TS strict + Tailwind; Supabase (free); `.env.example`; README; script dev/build/lint/typecheck/test (Vitest).
2. **M1-lite — Catalogo:** migrations per `activities`, `events`, `places`, `content_sources`, `families` (pilot), `recommendations` + `recommendation_items`, `feedback`. Gestione contenuti dall'editor tabelle di Supabase (niente admin custom). RLS: catalogo leggibile solo se `published`; tabelle famiglie/raccomandazioni accessibili solo service role (nessun login utente).
3. **M2-lite — Motore:** filtri rigidi (età di tutti i figli, data/scadenza evento, stato, distanza km da coordinate, budget) + score su 3 criteri (età, meteo, distanza) + diversificazione categorie. Compatibilità: all_children / adaptable / partial. Test unitari con il caso 5-9-11 anni.
4. **M3-lite — Meteo:** adapter Open-Meteo con timeout/fallback e timestamp aggiornamento; pioggia → abbassa outdoor e propone piano B.
5. **M4-lite — Bozza mail del venerdì:** pagina/script server che per ogni famiglia genera 3 idee + piano B pioggia + 1 domanda di feedback; il founder rivede e approva; invio via provider gratuito (Brevo o Resend) **solo dopo approvazione**, con log anti-duplicato.
6. **Seed:** 30 attività evergreen multi-età (marcate `demo`/`da_verificare` finché il founder non le verifica). Nessun evento inventato.

## Tabella famiglie pilota (`families`)
Solo: id, email, consenso (timestamp), zona/località, raggio km, età figli (array di interi 0-17), budget indicativo, preferenza indoor/outdoor, interessi. **Niente nomi o date di nascita dei minori.** Raccolta via form esterno (Tally/Google Forms) e import CSV.

## Fuori perimetro (rinviato)
Login/profili utente, planner, condivisione, digest automatico schedulato, LLM, PostHog, n8n, area admin, affiliazioni, `verticals`, audit log, Grottammare, PWA.

## Aggiunte al CLAUDE.md (sezione 5.3)
- Lavora solo sulla milestone approvata dal founder; non avviare la successiva senza via libera.
- Perimetro attuale = concierge tool (vedi docs/HANDOFF.md); la PROJECT_SPEC completa è roadmap futura, non obiettivo attuale.
- Nessun invio email senza approvazione esplicita del founder per quel venerdì.
- Tetto: ogni milestone in una sessione da 1-2 h; se serve di più, fermati e proponi un taglio.

## Criteri del test (dal CdA)
- 15-30 famiglie Bologna, 4 venerdì: 4/12, 11/12, 18/12, 8/1.
- Al 3° invio: domanda prezzo/impegno.
- Stop se: <50% usa una proposta, <50% attivi alla 4ª settimana, curatela >2 h/settimana.
- Decisione 12-15/1.

## Prompt di avvio per la nuova sessione
```text
Leggi CLAUDE.md, PROJECT_SPEC.md e docs/HANDOFF.md (perimetro concierge tool,
decisione CdA 1/11/2026). Il perimetro attuale è HANDOFF.md, non la spec completa.

Prima di modificare file: ispeziona il repo, riassumi lo stato, segnala conflitti
e costi, proponi un piano breve.

Poi implementa solo M0-lite. Esegui lint, typecheck, test e build e riporta
i risultati reali. Fermati e aspetta il mio via libera per M1-lite.
```

## Prima della sessione (founder, 15 minuti)
- Creare account Supabase (free) e Vercel (Hobby) se non già presenti.
- Decidere: repo sul PC (cartella da collegare) o creato in sessione cloud + GitHub.
