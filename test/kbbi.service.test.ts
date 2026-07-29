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
        kbbiUrl: "https://kbbi.example.test/entri",
        upstream: {
          kbbiFetchTimeoutMs: 45000,
        },
      },
    }));
    vi.doMock("../src/lib/http-client", () => ({
      getScraperHtml,
      isHttpNotFound: () => false,
    }));

    const { KbbiService } = await import("../src/services/kbbi.service");
    const service = new KbbiService();

    await service.search("ajar");

    expect(getScraperHtml).toHaveBeenCalledWith("https://kbbi.example.test/entri/ajar", {
      timeoutMs: 45000,
    });
  });
});
