# Seed attività Bologna - note (verifica del 2026-11-01)

File: `seed_attivita_bologna.csv` (30 righe, tutte `da_verificare`, `is_demo=true`).

## Conteggi
- **Setting**: indoor 15, mixed 4, outdoor 11
- **Categoria**: museo 10, natura 7, scienza 5, sport 3, gita 2, biblioteca 1, laboratorio 1, fattoria 1
- **Costo**: free 12, low 13, mid 3, non indicato 2 (Up Urban Climbing, Palazzo Pepoli)
- **Meteo**: rain_ok 19, dry_only 10, any 1
- **Prenotazione**: unknown 17, false 9, true 4
- **Zone**: Centro storico 10, Navile 3, Santo Stefano 3, resto distribuito su 12 zone/comuni (Borgo Panigale, Roveri, Porto-Saragozza, Casalecchio, Sala Bolognese, Budrio, Bentivoglio x2, Valsamoggia x2, Persiceto, Sasso Marconi, Monte San Pietro, San Lazzaro)

## Limiti del lavoro (leggere)
- Le fonti sono quasi tutte **Bologna Welcome / italia.it / Città metropolitana**, non i siti dei singoli musei: molti siti ufficiali non erano raggiungibili dal tool di ricerca. Prezzi e orari sono indicativi.
- **lat/lng compilati solo per 3 righe** (Orto Botanico, MAMbo, Villa Griffone), da Wikipedia. Il geocoding (Nominatim) è bloccato dalla rete: le altre 27 sono vuote. Vanno geocodificate in blocco.
- **Zone dei quartieri** (Santo Stefano, Porto-Saragozza, Roveri, Navile per MAMbo) assegnate a mano: controllare.
- **Fattoria/animali scoperta**: solo 1 riga verificata (fonte Freedome, non ufficiale). La Kasetta (Castel San Pietro) è citata da Bologna Welcome ma senza dati: esclusa. Serve almeno un'altra fattoria con apertura al pubblico regolare (le "Fattorie Aperte" sono eventi, non evergreen).
- **Biblioteca e laboratorio**: 1 riga ciascuno. Giocars è classificato "laboratorio" perché offre laboratori, ma è un museo.
- Nessuna attività risultata chiusa definitivamente. Nessuna esclusa per questo motivo.

## Controlli prioritari (in ordine)
1. **torre-della-specola**: un articolo dice chiusura da feb 2024 per lavori, riapertura prevista 2025. Confermare che sia aperta e riprenotabile.
2. **parco-avventura-cavaioni**: dati e prezzi del 2024. Stagionale (apr-ott): probabilmente chiuso in questo periodo.
3. **fattoria-didattica-monte-san-pietro**: stagionale (gen-set); fonte è un marketplace; indirizzo non pubblico.
4. **museo-civilta-contadina-villa-smeraldi**: orari incoerenti tra orario standard e avviso estate 2026.
5. **museo-ducati-fisica-in-moto**: prezzo intero 17 o 18 €; incoerenza sul mercoledì; tariffe bimbi e dettagli di Fisica in Moto non letti.
6. **museo-ocarina-budrio**: aperto solo la 3a domenica del mese (altrimenti su appuntamento).
7. **museo-tattile-anteros**: solo su appuntamento; orari diversi tra fonti; idoneità ai bambini non dichiarata (min_age 6 è una stima).
8. **up-urban-climbing**: prezzi assenti; orari da fonte non ufficiale; età minima 4 dai corsi.
9. **museo-storia-bologna-palazzo-pepoli**: biglietto museo non letto; i tour famiglie sono a date fisse (non evergreen).
10. **orto-botanico-bologna**: "gratuito" secondo Bologna Welcome, da confermare; orari invernali ridotti (9-15).
11. **museo-civico-archeologico**: pagina con orari incoerenti; martedì chiuso.
12. **museo-palazzo-poggi, museo-capellini-geologia**: gratuità under 18 ricavata dal tariffario SMA (non attribuita con certezza al singolo museo).
13. **museo-cielo-e-terra-persiceto, giocars, villa-griffone-museo-marconi, rocca-dei-bentivoglio-bazzano**: orari/prenotazioni assenti o parziali.
14. **parco-gessi-bolognesi-farneto, chiusa-di-casalecchio, parco-abbazia-monteveglio**: gratuità inferita (parchi pubblici); centro visite e grotte non verificati.
15. **min_age/max_age**: stime editoriali (non dichiarate dalle fonti) per tutte le righe; Cavaioni da altezza 100/140 cm.

## Fonti non ufficiali
- up-urban-climbing (flawless.life), fattoria-didattica-monte-san-pietro (freedome.it): sostituire con i siti ufficiali (upurbanclimbing.it, sito della fattoria).

## Integrazioni del coordinatore (1/11/2026)
- **Coordinate:** 27 righe senza lat/lng compilate con coordinate **approssimate** (da indirizzo noto, ±300 m in città, ±1-2 km fuori città; fattoria Monte San Pietro molto vaga). Da verificare tutte prima del primo invio. Esatte da fonte: Orto Botanico, MAMbo, Villa Griffone.
- **Costo:** Up Urban Climbing → `mid`, Palazzo Pepoli → `low` (stime, da verificare).
- **Escluse dal motore (status `draft`):** Cavaioni Park (stagionale aprile-ottobre), Fattoria Monte San Pietro (gennaio-settembre, indirizzo solo su prenotazione), Torre della Specola (chiusura lavori 2024 da confermare). Attive nel motore: 27.
