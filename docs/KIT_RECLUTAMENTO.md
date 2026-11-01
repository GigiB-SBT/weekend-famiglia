# Weekend in Famiglia — Bologna: kit di reclutamento

Pilota gratuito, 4 venerdì: 4/12, 11/12, 18/12/2026 e 8/1/2027. Target 15-30 famiglie. Organizzato da un privato (Luigi), non da un'azienda. Nessuna app, nessun login.

---

## 1. Form di iscrizione (Tally)

**Titolo form:** Weekend in Famiglia — Bologna (pilota gratuito)
**Testo di apertura:** Ogni venerdì ti mando una mail con 3 idee per il weekend che vanno bene per tutti i tuoi figli insieme, più un piano B se piove. 4 venerdì, gratis, nessuna app. Bastano 2 minuti.

Mappatura con la tabella `families` (HANDOFF.md). `id` è generato dal database; `consenso` = timestamp di invio del form, che si ottiene dalla colonna *Submitted at* dell'export CSV di Tally.

| # | Domanda (testo esatto) | Tipo Tally | Opzioni / validazione | Obbl. | Campo `families` |
|---|---|---|---|---|---|
| 1 | La tua email (ci scrivo solo per il pilota) | Email | Formato email | Sì | `email` |
| 2 | In che zona di Bologna abiti? | Scelta singola | Borgo Panigale-Reno / Navile / Porto-Saragozza / San Donato-San Vitale / Santo Stefano / Savena / Comune della provincia (specificare) | Sì | `zona` |
| 2b | Quale comune? | Testo breve, condizionale (solo se alla 2 scegli "Comune della provincia") | Solo il nome del comune | Sì, se mostrata | `zona` (valore = nome comune) |
| 3 | Fino a quanti km sei disposto a spostarti per l'uscita? | Scelta singola | 5 km / 10 km / 20 km / 30 km | Sì | `raggio_km` (intero) |
| 4 | Che età hanno i tuoi figli? Scrivi solo i numeri, separati da virgola (es. 5, 9, 11) | Testo breve (input numeri) | Numeri interi 0-17 separati da virgola. Hint: "Solo età in anni, niente nomi né date di nascita. Un bimbo di 8 mesi = 0." Regex di validazione: `^(1[0-7]\|[0-9])(\s*,\s*(1[0-7]\|[0-9]))*$` | Sì | `eta_figli` (array di interi) |
| 5 | Budget indicativo per ogni uscita (per tutta la famiglia) | Scelta singola | Gratis / fino a 20 € / 20-50 € / oltre 50 € | Sì | `budget` |
| 6 | Preferisci attività... | Scelta singola | Al chiuso / All'aperto / Indifferente | Sì | `indoor_outdoor` |
| 7 | Cosa piace ai vostri figli? (opzionale, scegli quanto vuoi) | Scelta multipla | Natura e animali / Sport e movimento / Arte e laboratori / Scienza e musei / Storia e castelli / Musica e teatro / Giochi e avventura / Cucina | No | `interessi` (array) |
| 8 | Consenso (vedi testo sotto) | Checkbox | Una sola casella | Sì | `consenso` (timestamp) |
| 9 | Contatto feedback (vedi testo sotto) | Checkbox | Una sola casella | No | non in `families` |

**Testo checkbox consenso (8):**
> Acconsento al trattamento della mia email e delle informazioni indicate (zona, raggio, età dei figli in anni, budget, preferenze) da parte di [Nome Cognome] al solo scopo di ricevere le mail del pilota "Weekend in Famiglia — Bologna", come descritto nell'[informativa privacy]([LINK INFORMATIVA]). Posso revocare il consenso in qualsiasi momento con il link in ogni mail.

**Testo checkbox opzionale (9):**
> Sono disponibile a una chiacchierata di 10 minuti (telefono o video) per raccontare cosa ne penso. Facoltativo.

Note operative:
- La casella 9 non fa parte di `families`: nell'import CSV scartala oppure aggiungi la colonna `ok_chiamata` (booleano) solo se vuoi usarla. Va comunque trattata come dato facoltativo ed è coperta dall'informativa.
- Non aggiungere campi per nome, cognome, nomi dei figli o date di nascita. Disattiva in Tally ogni raccolta extra (IP, geolocalizzazione, tracciamenti) e, se il piano lo consente, i pixel di analytics.
- Pagina di ringraziamento: "Grazie! La prima mail arriva venerdì 4 dicembre. Per disiscriverti: link in fondo a ogni mail."
- Dopo l'invio manda una mail di conferma manuale a ogni iscritto, con l'informativa e il link per disiscriversi.

---

## 2. Informativa privacy breve

> **Bozza da far verificare; non è consulenza legale.**

**Informativa ai sensi dell'art. 13 Reg. UE 2016/679 (GDPR) — pilota "Weekend in Famiglia — Bologna"**

**Titolare del trattamento.** [Nome Cognome], persona fisica, [indirizzo/città], email [email di contatto]. Il pilota è un'iniziativa personale e gratuita, non di un'azienda.

**Dati trattati.** Solo questi: indirizzo email; data e ora del consenso; zona di residenza (quartiere o comune); raggio di spostamento in km; età dei figli espressa come numeri interi in anni; budget indicativo per uscita; preferenza al chiuso/all'aperto; interessi dei figli (facoltativi). Se spunti la casella facoltativa, anche la tua disponibilità a una chiacchierata di 10 minuti.

**Cosa NON raccogliamo.** Nomi o cognomi dei figli, date di nascita, foto, indirizzo di casa preciso, numero di telefono (salvo che tu lo scriva tu stesso accordandoti per la chiacchierata), dati di pagamento, posizione GPS. Non c'è nessun account né app.

**Età dei figli.** Le età sono indicate solo come numeri, senza nome né data di nascita, e non servono a identificare i bambini. Le usiamo per scegliere idee adatte a tutti i figli e, in forma aggregata, per capire che fasce d'età partecipano al pilota.

**Finalità.** (1) Inviarti ogni venerdì, dal 4/12/2026 all'8/1/2027, una mail con idee per il weekend; (2) raccogliere il tuo feedback per migliorare il servizio; (3) valutare se il progetto ha senso, con statistiche aggregate e anonime. Nessuna pubblicità, nessuna profilazione automatizzata che produca effetti giuridici, nessuna vendita dei dati.

**Base giuridica.** Il tuo consenso (art. 6, par. 1, lett. a GDPR), dato con la casella nel form.

**Conservazione.** Fino alla fine del pilota (8/1/2027) e per al massimo 3 mesi successivi, poi cancellazione di tutti i dati personali. Resteranno solo dati aggregati e anonimi. Se revochi il consenso o chiedi la cancellazione, i tuoi dati vengono eliminati senza attendere questi termini.

**Destinatari e fornitori (responsabili del trattamento).** I dati sono trattati dal titolare e dai fornitori tecnici di cui si serve: [Tally] per il form; [Supabase] per il database; [Brevo / Resend] per l'invio delle mail. Non sono comunicati ad altri soggetti né diffusi. *Trasferimenti extra-UE: alcuni fornitori potrebbero trattare i dati fuori dallo Spazio Economico Europeo o avere sub-fornitori extra-UE. [DA VERIFICARE prima del lancio: sede e regione dei server di ciascun fornitore, esistenza del DPA, garanzie adottate (es. clausole contrattuali standard, Data Privacy Framework). Scegliere se possibile la regione UE su Supabase.]*

**I tuoi diritti.** Puoi chiedere in ogni momento accesso, rettifica, cancellazione, limitazione, opposizione e portabilità dei dati (artt. 15-22 GDPR) scrivendo a [email]. Hai il diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

**Revoca del consenso e disiscrizione.** Puoi revocare il consenso in qualsiasi momento, senza conseguenze, cliccando sul link "Disiscriviti" in fondo a ogni mail o scrivendo a [email]. La revoca non pregiudica la liceità del trattamento già avvenuto. Conferire i dati è facoltativo, ma senza email e senza i dati obbligatori del form non posso inviarti le mail del pilota.

*Ultimo aggiornamento: [data].*

---

## 3. Messaggi di invito

### (a) WhatsApp, chat di amici/classe (max 400 caratteri)

```
Ciao! Sto facendo un piccolo esperimento da papà: ogni venerdì (4 settimane, da dicembre) mando per mail 3 idee per il weekend a Bologna che vanno bene per TUTTI i figli insieme (anche con età diverse, tipo 5, 9 e 11), più un piano B se piove. Gratis, niente app né login. Cerco 15-30 famiglie per provarlo: 2 minuti per iscriversi: [LINK FORM] Grazie, e dimmi cosa ne pensi! Luigi
```

### (b) Email / post per gruppi genitori o Facebook locali (max 900 caratteri)

```
Ciao a tutti! Sono Luigi, papà di tre figli a Bologna. Sappiamo tutti com'è il sabato mattina: "cosa facciamo oggi?", e trovare qualcosa che vada bene sia al piccolo sia al più grande è un'impresa.

Sto provando a risolvere il problema con un esperimento gratuito: dal 4 dicembre all'8 gennaio, ogni venerdì mando una mail con 3 idee per il weekend pensate per far stare bene TUTTI i figli insieme (anche con età diverse), più un piano B per la pioggia e una domanda per sapere com'è andata.

Non è un'azienda, sono io (un privato). Niente app, niente login, nessuna pubblicità. Chiedo solo email, zona, età dei figli (solo i numeri, niente nomi) e qualche preferenza. Dati cancellati a fine pilota.

Cerco 15-30 famiglie di Bologna e dintorni. Se ti va di provare e dirmi sinceramente cosa funziona e cosa no, iscriviti qui (2 minuti): [LINK FORM]

Grazie!
Luigi
```

### (c) Reminder di una riga

```
Ultimi posti per il pilota "Weekend in Famiglia" (gratis, parte venerdì 4/12): se vuoi provarlo ti iscrivi qui in 2 minuti → [LINK FORM]
```

---

## 4. Canali di reclutamento (target ~2 settimane, totale 15-30)

Calendario: promozione ~20/11 - 3/12. Lancio non prima del 20/11, perché il test chiuso di Unpiatto ha la precedenza.

| Priorità | Canale | Target famiglie | Come |
|---|---|---|---|
| 1 | Contatti personali (amici, colleghi con figli, vicini, famiglia allargata) | 6-10 | Messaggio (a) uno a uno o in chat piccole. Chiedi di inoltrarlo a 1-2 famiglie. |
| 2 | Chat di classe/scuola dei propri figli | 4-8 | Messaggio (a), solo con ok dei rappresentanti di classe. |
| 3 | Società sportive, scuole di musica, doposcuola frequentati dai figli | 2-5 | Messaggio (b) al responsabile o in bacheca, solo con permesso. |
| 4 | Gruppi Facebook locali di genitori di Bologna | 2-5 | Messaggio (b), dopo approvazione dell'admin; rispondi a ogni commento. |
| 5 | Tester di Unpiatto, con invito incrociato dopo il 20/11 | 2-5 | Invito personale, mai in blocco; solo a chi ha già dato il consenso a essere ricontattato. |

Per arrivare a 15 iscritti conviene puntare a 25-30 contatti caldi, con una conversione realistica del 40-60% sui personali e molto più bassa sui gruppi.

**3 regole**
1. **Niente spam nei gruppi:** pubblica solo con il permesso esplicito dell'admin o del rappresentante, un solo post per gruppo, nessun re-post insistente.
2. **Trasparenza:** dì sempre che sei un privato, che è gratuito e che è un esperimento; nessuna promessa su eventi o risultati, nessun dato dei figli oltre alle età.
3. **Solo opt-in:** non aggiungere nessuno a liste o mailing senza che compili il form; non usare indirizzi raccolti per altri scopi (compresi quelli di Unpiatto) senza un invito e un consenso nuovi.

---

## 5. Esempio mail del venerdì

**Famiglia di esempio:** figli 5, 9, 11 anni; Santo Stefano; raggio 10 km; budget fino a 20 €. Tutti i nomi sono segnaposto: da sostituire con attività verificate dal founder.

**Oggetto:** 3 idee per il weekend (5, 9 e 11 anni) + piano B pioggia

---

Ciao! Ecco 3 idee per questo weekend, scelte perché funzionano per tutti e tre i tuoi figli. Tempo di lettura: 1 minuto.

**1. [Parco X]: caccia al tesoro naturalistica**
Perché funziona: il piccolo cerca e raccoglie, i grandi risolvono gli indizi e fanno squadra.
Costo: gratis · Distanza: [X km da Santo Stefano] · [LINK]

**2. [Museo X]: percorso interattivo per famiglie**
Perché funziona: postazioni da toccare per i 5 anni, quiz e curiosità per 9 e 11.
Costo: [~X €] a famiglia · Distanza: [X km] · [LINK]

**3. [Laboratorio / Fattoria X]: pomeriggio in cortile**
Perché funziona: animali e giochi per il piccolo, un compito vero per i più grandi.
Costo: [~X €] · Distanza: [X km] · [LINK]

**Se piove:** [Biblioteca / Ludoteca X], gioco libero + angolo laboratorio: al coperto e gratuito, adatto a tutte le età. [LINK]

**Una domanda sola:** com'è andata con le idee della scorsa settimana?
[Ne abbiamo fatta una, bene!] · [Ne abbiamo fatta una, così così] · [Nessuna questa volta]
*(Ogni risposta è un link: basta un clic.)*

Per non ricevere più queste mail: [Disiscriviti]. Sono Luigi, un papà di Bologna: rispondi pure a questa mail se vuoi dirmi altro.

---

## 6. Domanda prezzo/impegno (3° venerdì, 18/12)

Da inserire al posto della domanda di feedback normale, o subito dopo. Una sola domanda, risposte con un clic.

**Versione A — Disponibilità a pagare**
> Se Weekend in Famiglia continuasse con più idee e più precisione sulla tua famiglia, quanto sarebbe giusto pagare?
> - Non pagherei, mi basta se è gratis
> - Pagherei 3 €/mese
> - Pagherei 5 €/mese
> - Pagherei più di 5 €/mese

**Versione B — Impegno e passaparola**
> Se tra un mese ci fosse una nuova edizione, cosa faresti?
> - La aspetterei volentieri e la consiglierei a un amico
> - La leggerei volentieri ma senza consigliarla
> - La leggerei di meno
> - Non mi interessa più

**Soglia da fissare prima del 18/12:** [DA FISSARE]. Default suggerito: **almeno il 30% delle famiglie attive** risponde "pagherei 3 €/mese" (A, qualsiasi opzione a pagamento) oppure "la consiglierei a un amico" (B). Annota la soglia nel documento del test prima di inviare, per evitare di adattarla dopo aver visto i risultati. Ricorda che i criteri di stop del CdA restano: meno del 50% usa una proposta, meno del 50% attivi alla 4ª settimana, curatela oltre 2 ore a settimana. Decisione 12-15/1.
