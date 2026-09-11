import { describe, expect, it } from "vitest";
import { decodeDemoManifest } from "./manifest.ts";

const entry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "medium",
  file: "medium.jsonl",
  name: "Medium session",
  description: "Sixty-two API Calls.",
  bytes: 734_845,
  calls: 62,
  model: "claude-opus-4-8",
  claudeCodeVersion: "2.1.209",
  ...overrides,
});

const manifest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  note: "Demo Sessions are synthetic.",
  defaultSessionId: "medium",
  sessions: [entry()],
  ...overrides,
});

const rejection = (value: unknown): string => {
  const decoded = decodeDemoManifest(value);
  if (decoded.ok) throw new Error("expected the manifest to be rejected");
  return decoded.message;
};

describe("decodeDemoManifest", () => {
  it("decodes a well-formed manifest", () => {
    const decoded = decodeDemoManifest(manifest());

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.manifest.defaultSessionId).toBe("medium");
    expect(decoded.manifest.sessions).toHaveLength(1);
    expect(decoded.manifest.sessions[0]?.calls).toBe(62);
  });

  it("rejects a manifest whose default id names no session", () => {
    expect(rejection(manifest({ defaultSessionId: "huge" }))).toContain("huge");
  });

  it("rejects a manifest that lists no sessions", () => {
    expect(rejection(manifest({ sessions: [] }))).toContain("lists no sessions");
  });

  it("rejects a session that is missing a field", () => {
    const incomplete = entry();
    delete incomplete["description"];

    expect(rejection(manifest({ sessions: [incomplete] }))).toContain("missing a field");
  });

  it("rejects a session whose call count is not a positive integer", () => {
    expect(rejection(manifest({ sessions: [entry({ calls: 0 })] }))).toContain("missing a field");
  });

  // The file name is joined onto the demo directory, so a separator in it would
  // let the manifest aim the loader at any path on the origin.
  it("rejects a file name that contains a path", () => {
    expect(rejection(manifest({ sessions: [entry({ file: "../secrets.jsonl" })] }))).toContain(
      'has a path in "file"',
    );
    expect(rejection(manifest({ sessions: [entry({ file: "a\\b.jsonl" })] }))).toContain(
      'has a path in "file"',
    );
  });

  it("rejects two sessions that share an id", () => {
    expect(rejection(manifest({ sessions: [entry(), entry()] }))).toContain("used twice");
  });

  it("rejects values that are not manifests at all", () => {
    expect(rejection(null)).toContain("not an object");
    expect(rejection([entry()])).toContain("not an object");
    expect(rejection("{}")).toContain("not an object");
  });
});
