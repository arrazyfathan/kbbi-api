import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseIndonesianFigureCategoryHtml,
  parseIndonesianFigureDetailHtml,
} from "../src/features/figures/figure.parser";
import { parseKbbiHtml } from "../src/features/kbbi/kbbi.parser";
import { parseProverbDetailHtml, parseProverbListHtml } from "../src/features/proverbs/proverb.parser";

const proverbSourceUrl = "https://id.wikiquote.org/wiki/Peribahasa_Indonesia";
const figureSourceUrl = "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "test", "fixtures", name), "utf8");
}

describe("KBBI parser fixtures", () => {
  it("parses direct lookup records with multiple entries, definitions, and word classes", () => {
    expect(parseKbbiHtml(fixture("kbbi-word.html"))).toEqual([
      {
        headword: "a.jar /ajar/",
        definitions: [
          {
            wordClass: "v[Verba] n[Nomina]",
            description: "petunjuk yang diberikan kepada orang supaya diketahui;",
          },
          {
            wordClass: "v[Verba] n[Nomina]",
            description: "segala sesuatu yang diajarkan;",
          },
        ],
      },
      {
        headword: "meng.a.jar",
        definitions: [
          {
            wordClass: "v[Verba]",
            description: "memberi pelajaran",
          },
        ],
      },
    ]);
  });

  it("returns null for empty or not-found-style pages", () => {
    expect(parseKbbiHtml(fixture("kbbi-empty.html"))).toBeNull();
    expect(parseKbbiHtml(fixture("malformed.html"))).toBeNull();
  });

  it("does not mistake the page's client-side not-found template for a failed lookup", () => {
    expect(
      parseKbbiHtml(`
        <div id="d1">de&#183;mo&#183;kra&#183;si</div>
        <script type="application/json" id="jsdata">[{"x":1,"d":"<b>de&#183;mo&#183;kra&#183;si</b> <em>n Pol</em> pemerintahan rakyat"}]</script>
        <script>const notFoundTemplate = "Maaf, tidak ditemukan kata yang dicari";</script>
      `),
    ).toEqual([
      {
        headword: "de.mo.kra.si",
        definitions: [
          {
            wordClass: "n[Nomina] Pol[Politik dan Pemerintahan]",
            description: "pemerintahan rakyat",
          },
        ],
      },
    ]);
  });

  it("finds an exact derived word from related records when the direct lookup is absent", () => {
    expect(
      parseKbbiHtml(
        `<script type="application/json" id="jsdata">[{"x":5,"d":"<b>li&#183;mas</b> <em>n</em> bentuk atap<br/><br/><b>li&#183;mas&#183;an</b> <em>v</em> berbentuk limas"}]</script>`,
        "limasan",
      ),
    ).toEqual([
      {
        headword: "li.mas.an",
        definitions: [{ wordClass: "v[Verba]", description: "berbentuk limas" }],
      },
    ]);
  });
});

describe("Wikiquote proverb parser fixtures", () => {
  it("parses list pages with normalized text, slugs, letters, and source URLs", () => {
    expect(parseProverbListHtml(fixture("proverb-list.html"), proverbSourceUrl)).toEqual([
      {
        text: "Ada gula ada semut",
        letter: "A",
        slug: "Ada_gula_ada_semut",
        sourceUrl: "https://id.wikiquote.org/wiki/Ada_gula_ada_semut",
      },
      {
        text: "Air beriak tanda tak dalam",
        letter: "A",
        slug: "Air_beriak_tanda_tak_dalam",
        sourceUrl: "https://id.wikiquote.org/wiki/Air_beriak_tanda_tak_dalam",
      },
      {
        text: "Bagai air di daun talas",
        letter: "B",
        slug: "Bagai_air_di_daun_talas",
        sourceUrl: "https://id.wikiquote.org/w/index.php?title=Bagai_air_di_daun_talas",
      },
    ]);
  });

  it("parses detail pages with meaning and fallback metadata", () => {
    expect(
      parseProverbDetailHtml(fixture("proverb-detail.html"), {
        sourceUrl: proverbSourceUrl,
        fallback: {
          text: "Ada gula ada semut",
          letter: "A",
          slug: "Ada_gula_ada_semut",
          sourceUrl: "https://id.wikiquote.org/wiki/Ada_gula_ada_semut",
        },
      }),
    ).toEqual({
      text: "Ada gula ada semut",
      letter: "A",
      slug: "Ada_gula_ada_semut",
      sourceUrl: "https://id.wikiquote.org/wiki/Ada_gula_ada_semut",
      meaning: "di tempat yang banyak rezeki, banyak orang datang",
    });
  });

  it("handles malformed proverb HTML without throwing", () => {
    expect(parseProverbListHtml(fixture("malformed.html"), proverbSourceUrl)).toEqual([]);
    expect(parseProverbDetailHtml(fixture("malformed.html"), { sourceUrl: proverbSourceUrl })).toEqual({
      text: "",
      letter: "",
      slug: "",
      sourceUrl: "https://id.wikiquote.org/wiki/",
      meaning: null,
    });
  });
});

describe("Wikiquote Indonesian figure parser fixtures", () => {
  it("parses category pages with slugs, source URLs, and next-page URLs", () => {
    expect(parseIndonesianFigureCategoryHtml(fixture("figure-category.html"), figureSourceUrl)).toEqual({
      items: [
        {
          name: "Soekarno",
          slug: "Soekarno",
          sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
        },
        {
          name: "Cut Nyak Dien",
          slug: "Cut_Nyak_Dien",
          sourceUrl: "https://id.wikiquote.org/w/index.php?title=Cut_Nyak_Dien",
        },
      ],
      nextUrl: "https://id.wikiquote.org/w/index.php?title=Kategori:Tokoh_Indonesia&pagefrom=Hatta",
    });
  });

  it("parses detail pages with photo, description, and normalized quotes", () => {
    expect(
      parseIndonesianFigureDetailHtml(fixture("figure-detail.html"), {
        sourceUrl: figureSourceUrl,
        fallback: {
          name: "Soekarno",
          slug: "Soekarno",
          sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
        },
      }),
    ).toEqual({
      name: "Soekarno",
      slug: "Soekarno",
      sourceUrl: "https://id.wikiquote.org/wiki/Soekarno",
      photo: "https://upload.wikimedia.org/soekarno.jpg",
      description: "Soekarno adalah Presiden pertama Republik Indonesia.",
      quotes: ["Gantungkan cita-citamu setinggi langit", "Jas merah"],
    });
  });

  it("handles malformed figure HTML without throwing", () => {
    expect(parseIndonesianFigureCategoryHtml(fixture("malformed.html"), figureSourceUrl)).toEqual({
      items: [],
      nextUrl: null,
    });
    expect(parseIndonesianFigureDetailHtml(fixture("malformed.html"), { sourceUrl: figureSourceUrl })).toEqual({
      name: null,
      slug: "",
      sourceUrl: "https://id.wikiquote.org/wiki/",
      photo: null,
      description: null,
      quotes: null,
    });
  });
});
