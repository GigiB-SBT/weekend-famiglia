# Fonti eventi famiglie/bambini a Bologna: note per lo script settimanale

Limite importante: WebFetch converte in markdown e toglie l'HTML grezzo, quindi JSON-LD, `<link rel=alternate>` e feed non sono verificabili da qui. In piu' molti URL diretti sono stati bloccati (testoniragazzi.it, museibologna.it, bibliotechebologna.it, comune.bologna.it, chiesadibologna.it, endpoint API). Dove scrivo "non visto" significa non confermato, non assente. Vedi la checklist `curl` in fondo.

## Scoperta principale
Il Comune di Bologna ha un'unica "Agenda Cultura" (CMS BEdita di Chialab) che alimenta quattro siti con lo stesso schema `/objects/<slug>` e licenza dichiarata CC BY-SA 4.0: culturabologna.it, bolognazerodiciotto.it (0-18 anni), bolognaestate.it e bibliotecasalaborsa.it. Gli stessi dati sono pubblicati come open data su Opendatasoft, con aggiornamento giornaliero dichiarato. Quindi per la lettura automatica basta una sola fonte primaria.

## Le 3-5 fonti migliori per la lettura automatica
1. **Open data "Eventi - Bologna Agenda Cultura"** (Opendatasoft, verificata la pagina)
   - Dataset: https://bologna.opendatasoft.com/explore/dataset/eventi-bologna-agenda-cultura/table/ (mirror: opendata.comune.bologna.it)
   - Endpoint JSON: non visto. Provare il pattern standard Opendatasoft `https://bologna.opendatasoft.com/api/explore/v2.1/catalog/datasets/eventi-bologna-agenda-cultura/records?limit=100` (e `/exports/json`). E' un pattern della piattaforma, non confermato qui.
   - Campi e licenza non letti (lo schema non e' stato renderizzato). Il filtro "bambini" va fatto in script su categorie/tag (es. "under 16") e testo.
2. **bolognazerodiciotto.it**, calendario https://www.bolognazerodiciotto.it/objects/calendario-z18: portale 0-18 del Comune, la fonte piu' mirata. Solo HTML (pagine evento con meta Dublin Core), nessun feed visto. L'esempio letto era fermo al 28/05/2025, quindi controllare quanto e' aggiornato.
3. **culturabologna.it/objects/agenda** (e `/objects/calendario-bologna-cultura`): copertura piu' ampia (musei civici, biblioteche, fondazioni). Come fallback se l'API open data non funziona: scraping HTML leggero (1 richiesta a settimana), con attribuzione CC BY-SA.
4. **bolognaestate.it**: utile solo giugno-settembre; ha il filtro Quartiere "Borgo Panigale / Reno". Parametri URL non visti.
5. **Pinacoteca Nazionale** (`.../servizi-educativi/attivita-per-famiglie`): sito WordPress con eventi (`?post_type=event`); pagina mensile da leggere in HTML. `wp-json` non testato.

Non consigliati per l'automazione: bolognawelcome.com/it/eventi (Angular, l'elenco senza JS risulta vuoto, pagine vecchie del 2018 mescolate alle nuove, nessun feed visto).

## Da controllare a mano (o con PDF)
- Cineteca "Schermi e Lavagne": programma mensile in PDF (`Libretto-<Mese>_<anno>_web.pdf`), sito WordPress multisite. Non verificato direttamente.
- Teatro Testoni Ragazzi, Musei Civici, Fondazione Golinelli, Biblioteche di Bologna, Citta' metropolitana, pagine di quartiere: non raggiunti. Molti loro eventi arrivano comunque in Agenda Cultura (musei civici, biblioteche e fondazioni convenzionate sono fonti dichiarate), quindi e' probabile che il punto 1 li copra gia'.

## Parrocchie
- L'Agenda Cultura **esclude esplicitamente gli eventi religiosi** (oltre a corsi a pagamento, eventi per pubblici specifici e sagre): niente parrocchie dall'open data.
- Ho trovato un solo sito parrocchiale dell'area (parrocchiacasteldebole.it) e non ho potuto aprirlo. Dal path di un allegato (`/component/attachments/download/173.html`) sembra Joomla con avvisi come allegati/PDF. Calendario strutturato e RSS non confermati.
- Le ricerche per altre parrocchie di Borgo Panigale / Santa Viola non hanno restituito siti utili, e chiesadibologna.it non e' stato raggiunto. Non posso quindi dire quante pubblichino eventi online: l'ipotesi e' avvisi settimanali in PDF, social e passaparola. Raccomando un censimento manuale delle 4-6 parrocchie del quartiere, con ricontrollo mensile, non script.

## Aggregatori (solo piste, non copiare)
- FamilyGO: articolo in prosa, aggiornato il 30/10/2026, nessun feed visto. Footer con divieto di riproduzione anche parziale.
- Viaggiapiccoli: articoli editoriali WordPress, serie periodiche di "10 eventi per bambini". Nessun elenco strutturato.
- Entrambi rimandano a culturabologna.it/agenda come fonte primaria, a conferma della scelta.

## Checklist da fare con internet (5 minuti)
```
curl -sI "https://bologna.opendatasoft.com/api/explore/v2.1/catalog/datasets/eventi-bologna-agenda-cultura/records?limit=1"
curl -s  "https://bologna.opendatasoft.com/api/explore/v2.1/catalog/datasets/eventi-bologna-agenda-cultura?select=fields"   # schema e campi
for u in https://www.culturabologna.it/objects/agenda https://www.bolognazerodiciotto.it/objects/calendario-z18 \
         https://pinacotecabologna.cultura.gov.it/ https://cinetecadibologna.it/schermi-e-lavagne/ https://parrocchiacasteldebole.it/; do
  echo "== $u"; curl -s "$u" | grep -oiE 'application/ld\+json|rel="alternate"[^>]*(rss|atom|ics)[^>]*|wp-json' | sort -u; done
curl -s https://www.culturabologna.it/robots.txt
```
