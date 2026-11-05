import { describe, expect, it } from "vitest";
import { matchScore, pickPhoto, words } from "./photos";

describe("photos", () => {
  it("ignores generic words", () => {
    expect(words("Museo internazionale e biblioteca della musica")).toEqual(["internazionale", "musica"]);
  });
  it("matches only pages sharing distinctive words", () => {
    expect(matchScore("Biblioteca Salaborsa e Salaborsa Ragazzi", "Biblioteca Salaborsa")).toBe(1);
    expect(matchScore("Museo Capellini (Geologia e Paleontologia)", "Piazza Maggiore")).toBe(0);
  });
  it("picks the best match with a thumbnail, else nothing", () => {
    const pages = [
      { title: "Piazza Maggiore", thumbnail: { source: "a.jpg" } },
      { title: "Museo Giovanni Capellini", thumbnail: { source: "b.jpg" }, fullurl: "https://it.wikipedia.org/wiki/Museo_Giovanni_Capellini" },
      { title: "Capellini senza foto" },
    ];
    expect(pickPhoto("Museo Capellini (Geologia e Paleontologia)", pages)?.url).toBe("b.jpg");
    expect(pickPhoto("Castagnata in parrocchia", pages)).toBeNull();
  });
});
