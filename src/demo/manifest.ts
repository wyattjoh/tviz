/**
 * The bundled Demo Session manifest — what `public/demo/manifest.json`
 * declares, and how to read it without trusting it.
 *
 * Deliberately free of the DOM and of Effect: the browser loader
 * (`load-demo-sessions.ts`) and the repository's demo-data check
 * (`scripts/demo-data.test.ts`) both decode with this module, and Effect stays
 * inside the parser (ADR-0004).
 */

/**
 * Directory the Demo Sessions are served from, relative to the app's base URL.
 */
export const DEMO_DIRECTORY = "demo/";

/**
 * Name of the manifest file inside {@link DEMO_DIRECTORY}.
 */
export const DEMO_MANIFEST_FILE = "manifest.json";

/**
 * One bundled Demo Session, as the manifest describes it.
 *
 * Every field is either invented for the demo (`id`, `file`, `name`,
 * `description`) or measured from the anonymized file itself, so nothing here
 * carries a path or a name from the Session it was derived from.
 */
export type DemoSessionEntry = {
  /**
   * Stable key used to select a Demo Session; also the id the manifest's
   * `defaultSessionId` points at.
   */
  readonly id: string;
  /**
   * File name inside the demo directory. Must not contain a path separator:
   * the loader resolves it against the demo directory and nowhere else.
   */
  readonly file: string;
  /**
   * Display name for the Session list.
   */
  readonly name: string;
  /**
   * One sentence on what this Demo Session shows.
   */
  readonly description: string;
  /**
   * Size of the file in bytes, so a reviewer knows what a click will download.
   */
  readonly bytes: number;
  /**
   * Number of API Calls the parser finds in the file.
   */
  readonly calls: number;
  /**
   * Model id of the Session's first API Call.
   */
  readonly model: string;
  /**
   * Claude Code version recorded in the transcript.
   */
  readonly claudeCodeVersion: string;
};

/**
 * The manifest as a whole.
 */
export type DemoManifest = {
  /**
   * Statement of what the Demo Sessions are, rendered under the grid whenever a
   * Demo Session is on screen. It is required so that the data that produces
   * the Demo Sessions is also what says they are synthetic, rather than a
   * sentence in a component that regeneration cannot reach.
   */
  readonly note: string;
  /**
   * The `id` of the Demo Session to select once they are all loaded.
   */
  readonly defaultSessionId: string;
  /**
   * The bundled Demo Sessions, in the order they should be listed.
   */
  readonly sessions: readonly DemoSessionEntry[];
};

/**
 * The result of decoding an untrusted manifest value.
 */
export type DemoManifestDecoded =
  | {
      readonly ok: true;
      readonly manifest: DemoManifest;
    }
  | {
      readonly ok: false;
      /**
       * Why the manifest was rejected, phrased for the empty state.
       */
      readonly message: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const countField = (source: Record<string, unknown>, key: string): number | undefined => {
  const value = source[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
};

const decodeEntry = (value: unknown, index: number): DemoSessionEntry | string => {
  if (!isRecord(value)) return `session ${index} is not an object`;

  const id = stringField(value, "id");
  const file = stringField(value, "file");
  const name = stringField(value, "name");
  const description = stringField(value, "description");
  const model = stringField(value, "model");
  const claudeCodeVersion = stringField(value, "claudeCodeVersion");
  const bytes = countField(value, "bytes");
  const calls = countField(value, "calls");

  if (
    id === undefined ||
    file === undefined ||
    name === undefined ||
    description === undefined ||
    model === undefined ||
    claudeCodeVersion === undefined ||
    bytes === undefined ||
    calls === undefined
  ) {
    return `session ${index} is missing a field`;
  }
  // The file name is joined onto the demo directory, so a separator would let
  // the manifest point the loader at any path on the origin.
  if (file.includes("/") || file.includes("\\")) return `session ${index} has a path in "file"`;

  return { id, file, name, description, bytes, calls, model, claudeCodeVersion };
};

/**
 * Decodes an untrusted manifest value.
 *
 * Never throws: a malformed manifest comes back as `ok: false` with a message
 * the empty state can show.
 *
 * @param value - The parsed JSON of `public/demo/manifest.json`.
 * @returns The manifest, or the reason it was rejected.
 */
export const decodeDemoManifest = (value: unknown): DemoManifestDecoded => {
  const reject = (message: string): DemoManifestDecoded => ({
    ok: false,
    message: `The demo manifest is unusable: ${message}.`,
  });

  if (!isRecord(value)) return reject("it is not an object");

  const note = stringField(value, "note");
  if (note === undefined) return reject("it has no note");

  const defaultSessionId = stringField(value, "defaultSessionId");
  if (defaultSessionId === undefined) return reject("it names no default session");

  const rawSessions = value["sessions"];
  if (!Array.isArray(rawSessions) || rawSessions.length === 0) {
    return reject("it lists no sessions");
  }

  const sessions: DemoSessionEntry[] = [];
  for (const [index, raw] of rawSessions.entries()) {
    const entry = decodeEntry(raw, index);
    if (typeof entry === "string") return reject(entry);
    // This guards `defaultSessionId` resolving to one entry. The ids the UI
    // selects and keys on are the *parsed* Session ids, which the loader checks
    // separately — two entries can differ here and still parse to one id.
    if (sessions.some((existing) => existing.id === entry.id)) {
      return reject(`session id "${entry.id}" is used twice`);
    }
    sessions.push(entry);
  }

  if (!sessions.some((entry) => entry.id === defaultSessionId)) {
    return reject(`no session has the default id "${defaultSessionId}"`);
  }

  return { ok: true, manifest: { note, defaultSessionId, sessions } };
};
