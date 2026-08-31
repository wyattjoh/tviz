/**
 * Loads the bundled Demo Sessions so a reviewer with no transcripts can use the
 * tool immediately.
 *
 * Each Demo Session is fetched from the app's own assets, wrapped in a `File`,
 * and handed to the same Worker the drop path uses — there is no second parser
 * and no demo-only shortcut, so what a reviewer sees is what a dropped
 * transcript produces. Nothing is stored (ADR-0002); a reload fetches again.
 */
import type { LoadedSession } from "../domain/context.ts";
import { parseTranscriptFile } from "../worker/parse-client.ts";
import {
  DEMO_DIRECTORY,
  DEMO_MANIFEST_FILE,
  decodeDemoManifest,
  type DemoManifest,
  type DemoSessionEntry,
} from "./manifest.ts";

/**
 * Progress of a demo load, reported once per Demo Session before it is fetched.
 */
export type DemoLoadProgress = {
  /**
   * Name of the Demo Session being fetched.
   */
  readonly name: string;
  /**
   * One-based position of that Session in the manifest.
   */
  readonly index: number;
  /**
   * How many Demo Sessions the manifest lists.
   */
  readonly total: number;
};

/**
 * The result of loading the Demo Sessions.
 */
export type DemoLoadOutcome =
  | {
      readonly ok: true;
      /**
       * The loaded Demo Sessions, in manifest order.
       */
      readonly sessions: readonly LoadedSession[];
      /**
       * Id of the Session the manifest asks the UI to select.
       */
      readonly selectedId: string;
      /**
       * The manifest's statement of what Demo Sessions are, for the view to
       * show while one of them is on screen.
       */
      readonly note: string;
    }
  | {
      readonly ok: false;
      /**
       * Why the demo could not be loaded, phrased for the empty state.
       */
      readonly message: string;
    };

/**
 * Options for {@link loadDemoSessions}.
 */
export type LoadDemoSessionsOptions = {
  /**
   * Called before each Demo Session is fetched.
   */
  readonly onProgress: ((progress: DemoLoadProgress) => void) | undefined;
};

const demoUrl = (file: string): string => `${import.meta.env.BASE_URL}${DEMO_DIRECTORY}${file}`;

const failure = (message: string): DemoLoadOutcome => ({ ok: false, message });

const fetchDemo = async (file: string): Promise<Response | string> => {
  let response: Response;
  try {
    response = await fetch(demoUrl(file));
  } catch {
    return `The demo session ${file} could not be fetched. Check your connection and try again.`;
  }
  if (!response.ok) return `The demo session ${file} is missing (HTTP ${response.status}).`;
  return response;
};

const fetchManifest = async (): Promise<DemoManifest | string> => {
  const response = await fetchDemo(DEMO_MANIFEST_FILE);
  if (typeof response === "string") return response;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return "The demo manifest is unusable: it is not valid JSON.";
  }

  const decoded = decodeDemoManifest(body);
  return decoded.ok ? decoded.manifest : decoded.message;
};

const loadOne = async (entry: DemoSessionEntry): Promise<LoadedSession | string> => {
  const response = await fetchDemo(entry.file);
  if (typeof response === "string") return response;

  // The Worker reads the text itself, so the transcript never passes through
  // the main thread as a string — the same contract the drop path relies on.
  const file = new File([await response.blob()], entry.file, { type: "application/jsonl" });
  const outcome = await parseTranscriptFile(file);
  if (!outcome.ok) return `The demo session ${entry.name} did not parse: ${outcome.message}`;

  return { session: outcome.session, label: entry.name, description: entry.description };
};

/**
 * Fetches the demo manifest and every Demo Session it lists.
 *
 * Never rejects: a missing file, an unusable manifest or an unparsable Demo
 * Session all come back as `ok: false` with a message for the empty state.
 *
 * @param options - Progress callback, or `undefined` for none.
 * @returns The loaded Demo Sessions and the id to select, or the failure.
 */
export const loadDemoSessions = async (
  options: LoadDemoSessionsOptions = { onProgress: undefined },
): Promise<DemoLoadOutcome> => {
  const manifest = await fetchManifest();
  if (typeof manifest === "string") return failure(manifest);

  const sessions: LoadedSession[] = [];
  for (const [index, entry] of manifest.sessions.entries()) {
    options.onProgress?.({ name: entry.name, index: index + 1, total: manifest.sessions.length });
    const loaded = await loadOne(entry);
    if (typeof loaded === "string") return failure(loaded);
    // The UI selects and keys on the parsed Session id, not the manifest id,
    // and the Anonymizer keeps `sessionId` — so two Demo Sessions regenerated
    // from one source Session would collide and leave a row unselectable.
    // Manifest ids being distinct says nothing about this.
    if (sessions.some((existing) => existing.session.id === loaded.session.id)) {
      return failure(
        `Two Demo Sessions parsed to the same Session id (${loaded.session.id}). Regenerate ${entry.file} from a different Session.`,
      );
    }
    sessions.push(loaded);
  }

  const selected = sessions[manifest.sessions.findIndex((e) => e.id === manifest.defaultSessionId)];
  // `decodeDemoManifest` guarantees the default id exists, so this is only a
  // narrowing step; falling back to the first Session keeps it non-fatal.
  const selectedId = (selected ?? sessions[0])?.session.id;
  if (selectedId === undefined) return failure("The demo manifest lists no sessions.");

  return { ok: true, sessions, selectedId, note: manifest.note };
};
