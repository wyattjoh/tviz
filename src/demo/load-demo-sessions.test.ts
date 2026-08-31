// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "../parser/parse-transcript.ts";
import { loadDemoSessions } from "./load-demo-sessions.ts";

// jsdom has no Web Worker, so the client is stubbed with the parser it runs.
// The loader still hands over a `File`, which is the contract that matters.
const parseTranscriptFile = vi.hoisted(() => vi.fn());
vi.mock("../worker/parse-client.ts", () => ({ parseTranscriptFile }));

afterEach(() => {
  vi.unstubAllGlobals();
  parseTranscriptFile.mockReset();
  Fixture.resetFixtureSequence();
});

const transcript = (sessionId: string, callTokens: number): string =>
  Fixture.toJsonl([
    Fixture.skillListing(4_000),
    Fixture.userMessage(1_000),
    Fixture.assistantMessage({ id: `${sessionId}-1`, usage: { cacheRead: callTokens } }),
  ]).replaceAll(/"sessionId":"[^"]+"/g, `"sessionId":"${sessionId}"`);

const MANIFEST = {
  note: "Demo Sessions are synthetic.",
  defaultSessionId: "medium",
  sessions: [
    {
      id: "small",
      file: "small.jsonl",
      name: "Small session",
      description: "A short one.",
      bytes: 100,
      calls: 1,
      model: "claude-opus-4-7",
      claudeCodeVersion: "2.1.247",
    },
    {
      id: "medium",
      file: "medium.jsonl",
      name: "Medium session",
      description: "A longer one.",
      bytes: 200,
      calls: 1,
      model: "claude-opus-4-8",
      claudeCodeVersion: "2.1.209",
    },
  ],
};

const BODIES: Readonly<Record<string, string>> = {
  "small.jsonl": transcript("11111111-1111-4111-8111-111111111111", 30_000),
  "medium.jsonl": transcript("22222222-2222-4222-8222-222222222222", 60_000),
};

type FetchOverrides = {
  readonly missing?: string;
  readonly manifestBody?: unknown;
  readonly throwOn?: string;
};

const stubFetch = (overrides: FetchOverrides = {}): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (url: string) => {
    const file = url.slice(url.lastIndexOf("/") + 1);
    if (overrides.throwOn === file) throw new TypeError("network down");
    if (overrides.missing === file) return { ok: false, status: 404 } as unknown as Response;
    if (file === "manifest.json") {
      const body = overrides.manifestBody ?? MANIFEST;
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([BODIES[file] ?? ""], { type: "application/jsonl" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const parseRealTranscripts = (): void => {
  parseTranscriptFile.mockImplementation(async (file: File) =>
    parseTranscript(file.name, await file.text()),
  );
};

describe("loadDemoSessions", () => {
  it("loads every Demo Session through the Worker client and selects the manifest default", async () => {
    stubFetch();
    parseRealTranscripts();

    const outcome = await loadDemoSessions();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.sessions.map((loaded) => loaded.label)).toEqual([
      "Small session",
      "Medium session",
    ]);
    expect(outcome.sessions.map((loaded) => loaded.description)).toEqual([
      "A short one.",
      "A longer one.",
    ]);
    // The manifest's default is the medium Session, not the first one loaded.
    expect(outcome.selectedId).toBe("22222222-2222-4222-8222-222222222222");
    expect(outcome.note).toBe("Demo Sessions are synthetic.");
  });

  it("hands the Worker client a File and never reads the transcript itself", async () => {
    stubFetch();
    parseRealTranscripts();

    await loadDemoSessions();

    expect(parseTranscriptFile).toHaveBeenCalledTimes(2);
    for (const [argument] of parseTranscriptFile.mock.calls) {
      expect(argument).toBeInstanceOf(File);
    }
    expect(parseTranscriptFile.mock.calls[0]?.[0].name).toBe("small.jsonl");
  });

  it("fetches the Demo Sessions from the demo directory", async () => {
    const fetchMock = stubFetch();
    parseRealTranscripts();

    await loadDemoSessions();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/demo/manifest.json",
      "/demo/small.jsonl",
      "/demo/medium.jsonl",
    ]);
  });

  it("reports progress once per Demo Session before fetching it", async () => {
    stubFetch();
    parseRealTranscripts();
    const onProgress = vi.fn();

    await loadDemoSessions({ onProgress });

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { name: "Small session", index: 1, total: 2 },
      { name: "Medium session", index: 2, total: 2 },
    ]);
  });

  it("reports a missing Demo Session instead of throwing", async () => {
    stubFetch({ missing: "medium.jsonl" });
    parseRealTranscripts();

    const outcome = await loadDemoSessions();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("medium.jsonl is missing (HTTP 404)");
  });

  it("reports a failed fetch instead of throwing", async () => {
    stubFetch({ throwOn: "manifest.json" });

    const outcome = await loadDemoSessions();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("could not be fetched");
  });

  it("reports an unusable manifest instead of loading nothing silently", async () => {
    stubFetch({ manifestBody: { note: "x" } });

    const outcome = await loadDemoSessions();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("demo manifest is unusable");
  });

  it("refuses two Demo Sessions that parse to the same Session id", async () => {
    // The Anonymizer keeps `sessionId`, so regenerating two Demo Sessions from
    // one source Session produces this — and the UI keys Session rows on the
    // parsed id, so one row would be unselectable for ever.
    const shared = transcript("33333333-3333-4333-8333-333333333333", 30_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const file = url.slice(url.lastIndexOf("/") + 1);
        if (file === "manifest.json") {
          return { ok: true, status: 200, json: async () => MANIFEST } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([shared], { type: "application/jsonl" }),
        } as unknown as Response;
      }),
    );
    parseRealTranscripts();

    const outcome = await loadDemoSessions();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("parsed to the same Session id");
    expect(outcome.message).toContain("medium.jsonl");
  });

  it("reports a Demo Session the parser rejects", async () => {
    stubFetch();
    parseTranscriptFile.mockResolvedValue({
      ok: false,
      reason: "notATranscript",
      message: "small.jsonl is not a Claude Code transcript.",
    });

    const outcome = await loadDemoSessions();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain("Small session did not parse");
  });
});
