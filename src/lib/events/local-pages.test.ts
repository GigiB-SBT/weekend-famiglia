import { describe, expect, it } from "vitest";
import { extractEvents, findComune, findPdfLinks, htmlToText } from "../../../scripts/lib/local-pages.mjs";

const ref = new Date(2026, 10, 1);
const bulletin = `PARROCCHIA DI CASTEL DEBOLE
AVVISI DELLA SETTIMANA
Lunedì 2 novembre ore 18.30 Santa Messa per tutti i defunti.
Mercoledì 4 novembre catechismo per le classi elementari.
DOMENICA 8 NOVEMBRE
Castagnata in parrocchia dalle 15 alle 18 nel cortile: caldarroste e giochi per bambini.
Offerta libera.
Sabato 30 gennaio ore 20.30 Tombola di beneficenza.`;

describe("local pages reader", () => {
  it("finds the parish chestnut party with date from the heading, skips liturgy and out-of-window", () => {
    const ev = extractEvents(bulletin, { ref, from: "2026-11-01", to: "2026-11-17" }) as {
      title: string; date: string; startTime: string | null; endTime: string | null; guess: { costBand: string | null };
    }[];
    expect(ev).toHaveLength(1);
    expect(ev[0].title).toMatch(/^Castagnata in parrocchia/);
    expect(ev[0].date).toBe("2026-11-08");
    expect([ev[0].startTime, ev[0].endTime]).toEqual(["15:00", "18:00"]);
    expect(ev[0].guess.costBand).toBe("free");
  });
  it("finds bulletin PDF links and ignores other PDFs", () => {
    const html = '<a href="/component/attachments/download/201.html">Avvisi 1-8 novembre</a><a href="/statuto.pdf">Statuto</a>';
    expect(findPdfLinks(html, "https://p.example/x")).toEqual(["https://p.example/component/attachments/download/201.html"]);
  });
  it("reads the real Casteldebole home format and its bulletin links", () => {
    const home = `Prossimi appuntamenti
Pubblicato: 20 Giugno 2026
Domenica 8 novembre ore 16:00 Festa delle castagne nel salone e nei cortili parrocchiali.
Sabato 14 novembre Colletta Alimentare presso il Centro Commerciale di Casteldebole.`;
    const ev = extractEvents(home, { ref, from: "2026-11-01", to: "2026-11-17" }) as { title: string; date: string; startTime: string | null }[];
    expect(ev).toHaveLength(1);
    expect(ev[0].date).toBe("2026-11-08");
    expect(ev[0].startTime).toBe("16:00");
    expect(ev[0].title).toMatch(/Festa delle castagne/);
    const html = '<a href="/volantini.html?download=656%3Afoglietto-domenicale-25-ottobre-2026">Download</a>';
    expect(findPdfLinks(html, "https://www.parrocchiacasteldebole.it/volantini.html")).toEqual([
      "https://www.parrocchiacasteldebole.it/volantini.html?download=656%3Afoglietto-domenicale-25-ottobre-2026",
    ]);
  });
  it("reads a sagre listing with town and date range after the title", () => {
    const listing = `Upcoming events
Festa di San Martino
Casalecchio di Reno
6 November – 15 November 2026
Sagra dell'Anguilla e delle Rane
Molinella
14 November – 29 November 2026
Natale a Porta Galliera
Bologna
15 November 2026 – 6 January 2027`;
    const ev = extractEvents(listing, { ref, from: "2026-11-07", to: "2026-11-22", listing: true }) as {
      title: string; date: string; endDate: string | null; comune: { name: string } | null;
    }[];
    expect(ev.map((e) => [e.title, e.date, e.endDate, e.comune?.name])).toEqual([
      ["Festa di San Martino", "2026-11-06", "2026-11-15", "Casalecchio di Reno"],
      ["Sagra dell'Anguilla e delle Rane", "2026-11-14", "2026-11-29", "Molinella"],
    ]);
  });
  it("finds the most specific comune", () => {
    expect(findComune("Sagra a San Lazzaro di Savena, vicino a Bologna")?.name).toBe("San Lazzaro di Savena");
    expect(findComune("Festa del mare a Grottammare")?.area).toBe("grottammare");
    expect(findComune("nessun luogo")).toBeNull();
  });
  it("converts html to text", () => {
    expect(htmlToText("<p>Domenica&nbsp;8 novembre</p><p>ore 15</p>")).toBe("Domenica 8 novembre\nore 15");
  });
});
