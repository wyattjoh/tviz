// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParseOutcome } from "../parser/parse-transcript.ts";
import { transcriptFile } from "../ui/test-dom.ts";
import type { ParseRequest, ParseResponse } from "./messages.ts";

/**
 * Stands in for the Web Worker jsdom cannot run, recording what the client sent
 * it and letting a test answer.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly requests: ParseRequest[] = [];
  readonly options: WorkerOptions | undefined;
  readonly url: string;
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(url: string | URL, options?: WorkerOptions) {
    this.url = String(url);
    this.options = options;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(request: ParseRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(outcome: ParseOutcome, id: number): void {
    const response: ParseResponse = { id, outcome };
    for (const listener of this.listeners.get("message") ?? []) listener({ data: response });
  }

  crash(): void {
    for (const listener of this.listeners.get("error") ?? []) listener({});
  }
}

/**
 * Loads a fresh copy of the client so its cached Worker never leaks between
 * tests.
 */
const loadClient = async () => {
  vi.resetModules();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  return await import("./parse-client.ts");
};

const only = (): FakeWorker => {
  const worker = FakeWorker.instances[0];
  if (worker === undefined) throw new Error("the client created no Worker");
  return worker;
};

const session: ParseOutcome = {
  ok: false,
  reason: "empty",
  message: "session-a.jsonl is empty.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseTranscriptFile", () => {
  it("hands the file itself to a module Worker instead of reading it on the main thread", async () => {
    const { parseTranscriptFile } = await loadClient();
    const file = transcriptFile("session-a.jsonl", "{}\n");
    const readOnMainThread = vi.spyOn(file, "text");

    const pending = parseTranscriptFile(file);

    expect(only().options?.type).toBe("module");
    expect(only().url).toContain("parse-transcript.worker.ts");
    expect(only().requests[0]?.file).toBe(file);
    expect(readOnMainThread).not.toHaveBeenCalled();

    only().reply(session, only().requests[0]?.id ?? 0);
    await expect(pending).resolves.toEqual(session);
  });

  it("answers concurrent requests with their own outcome", async () => {
    const { parseTranscriptFile } = await loadClient();
    const first = parseTranscriptFile(transcriptFile("a.jsonl", "{}\n"));
    const second = parseTranscriptFile(transcriptFile("b.jsonl", "{}\n"));

    const [firstId, secondId] = only().requests.map((request) => request.id);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(firstId).not.toBe(secondId);

    only().reply({ ok: false, reason: "empty", message: "b" }, secondId ?? 0);
    only().reply({ ok: false, reason: "empty", message: "a" }, firstId ?? 0);

    await expect(first).resolves.toMatchObject({ message: "a" });
    await expect(second).resolves.toMatchObject({ message: "b" });
  });

  it("settles every in-flight request when the Worker crashes", async () => {
    const { parseTranscriptFile } = await loadClient();
    const pending = parseTranscriptFile(transcriptFile("a.jsonl", "{}\n"));

    only().crash();

    await expect(pending).resolves.toMatchObject({ ok: false, reason: "unreadable" });
    expect(only().terminated).toBe(true);
  });
});
