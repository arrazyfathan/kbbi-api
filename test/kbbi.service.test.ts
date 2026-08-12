import { beforeEach, describe, expect, it, vi } from "vitest";

describe("KbbiService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the configured KBBI fetch timeout when requesting upstream HTML", async () => {
    const getScraperHtml = vi.fn(
      async () => `
      <div class="body-content">
        <h2>ajar</h2>
        <ul>
          <li><span title="verba">v</span> memberi pelajaran</li>
        </ul>
      </div>
    `,
    );

    vi.doMock("../src/config", () => ({
      default: {
        kbbiUrl: "https://kbbi.example.test",
        upstream: {
          kbbiFetchTimeoutMs: 45000,
        },
      },
    }));
    vi.doMock("../src/lib/http-client", () => ({
      getScraperHtml,
      isHttpNotFound: () => false,
    }));

    const { KbbiService } = await import("../src/features/kbbi/kbbi.service");
    const service = new KbbiService();

    await service.search("ajar");

    expect(getScraperHtml).toHaveBeenCalledWith("https://kbbi.example.test/ajar", {
      timeoutMs: 45000,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9",
      },
      upstream: "kbbi",
    });
  });
});
