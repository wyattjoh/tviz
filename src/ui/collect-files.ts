/**
 * Turns a drag-and-drop or a file/folder picker into the transcripts the
 * loader should parse, and the Subagent Session counts a folder drop reveals.
 *
 * A dropped or picked file only ever carries a name; a *path* — which is what
 * tells a Subagent Session sidecar apart from its parent — only exists once
 * files come from a directory. {@link collectDataTransferEntries} and
 * {@link collectFileListEntries} are the two places a path gets attached, so
 * everything downstream works from {@link PathedFile} rather than `File`.
 */

/**
 * A file paired with its path relative to the drop or the picked folder.
 *
 * `path` is just the file name for a single picked file, and a `/`-joined
 * relative path for anything that came from a directory — never an absolute
 * path, so nothing about the user's machine leaks into it.
 */
export type PathedFile = {
  readonly file: File;
  readonly path: string;
};

/**
 * What a {@link PathedFile} means to the loader.
 *
 * `subagent` is never parsed (ADR: Subagent Sessions own a separate Context
 * Window; MVP counts only) — `parentId` is the directory name enclosing
 * `subagents/`, which is the Session id the count belongs to. `sidecarId` is
 * the path from `subagents/` on down (e.g. `subagents/agent-1.jsonl`): the
 * same sidecar dropped through a different ancestor — the whole project
 * folder one time, just the Session's own folder the next — carries a
 * different `path` but the same `sidecarId`, which is what a caller wanting
 * to dedupe repeat drops needs to key on.
 */
export type ClassifiedEntry =
  | { readonly kind: "transcript"; readonly file: File; readonly path: string }
  | { readonly kind: "subagent"; readonly parentId: string; readonly sidecarId: string }
  | { readonly kind: "ignored" };

const JSONL_EXTENSION = /\.jsonl$/i;

/**
 * Classifies one path against the transcript directory layout
 * (`docs/transcript-format.md`): `tool-results/` is offloaded output and
 * always ignored; a `.jsonl` file under a `subagents/` directory is a
 * Subagent Session sidecar, counted on the directory enclosing `subagents/`;
 * every other `.jsonl` file is a transcript to parse.
 *
 * A `subagents/` directory dropped as the root of the gesture itself (no
 * enclosing Session directory in `path` to read a `parentId` from) has
 * nothing to attribute a count to, so it is ignored rather than falling
 * through to the transcript branch — a Subagent Session transcript must
 * never be parsed and listed as its own Session.
 */
export const classifyEntry = (entry: PathedFile): ClassifiedEntry => {
  const segments = entry.path.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment.toLowerCase() === "tool-results")) {
    return { kind: "ignored" };
  }
  if (!JSONL_EXTENSION.test(entry.path)) {
    return { kind: "ignored" };
  }

  const subagentsIndex = segments.findIndex((segment) => segment.toLowerCase() === "subagents");
  if (subagentsIndex >= 0) {
    const parentId = segments[subagentsIndex - 1];
    if (parentId === undefined) return { kind: "ignored" };
    const sidecarId = segments.slice(subagentsIndex).join("/");
    return { kind: "subagent", parentId, sidecarId };
  }

  return { kind: "transcript", file: entry.file, path: entry.path };
};

/**
 * The result of classifying every entry from one drop or pick.
 */
export type PartitionedEntries = {
  /**
   * `.jsonl` files to hand to the parser.
   */
  readonly transcripts: readonly PathedFile[];
  /**
   * Subagent Session sidecars discovered, keyed by the parent Session id
   * (the directory enclosing `subagents/`) and holding each sidecar's
   * {@link ClassifiedEntry.sidecarId}. A caller merges this into whatever
   * sidecars it already holds by unioning the sets — never by adding sizes —
   * so the same sidecar counted twice (the same folder dropped again, or a
   * subdirectory re-dropped after its parent folder) still counts once.
   */
  readonly subagentPaths: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Splits a batch of dropped or picked entries into transcripts to parse and
 * Subagent Session sidecars, silently dropping everything else (non-`.jsonl`
 * files, `tool-results/` contents, Subagent `.meta.json` sidecars, and a
 * `subagents/` directory dropped with no parent to attribute it to).
 */
export const partitionEntries = (entries: readonly PathedFile[]): PartitionedEntries => {
  const transcripts: PathedFile[] = [];
  const subagentPaths = new Map<string, Set<string>>();

  for (const entry of entries) {
    const classified = classifyEntry(entry);
    if (classified.kind === "transcript") {
      transcripts.push({ file: classified.file, path: classified.path });
    } else if (classified.kind === "subagent") {
      const sidecars = subagentPaths.get(classified.parentId) ?? new Set<string>();
      sidecars.add(classified.sidecarId);
      subagentPaths.set(classified.parentId, sidecars);
    }
  }

  return { transcripts, subagentPaths };
};

/**
 * Collects every file from a picker `<input>` (a flat `FileList`, or the
 * relative-path-carrying one a `webkitdirectory` picker produces).
 */
export const collectFileListEntries = (
  list: FileList | null | undefined,
): readonly PathedFile[] => {
  if (list === null || list === undefined) return [];
  const entries: PathedFile[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const file = list.item(index);
    if (file === null) continue;
    const withRelativePath = file as File & { readonly webkitRelativePath?: string };
    const relativePath = withRelativePath.webkitRelativePath;
    entries.push({
      file,
      path: relativePath !== undefined && relativePath !== "" ? relativePath : file.name,
    });
  }
  return entries;
};

/**
 * A `FileSystemEntry` as narrowed by the drag-and-drop entries API, which
 * `lib.dom` does not type.
 */
type FileSystemEntryLike = {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly fullPath: string;
  file?: (success: (file: File) => void, error: (reason: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: readonly FileSystemEntryLike[]) => void,
      error: (reason: unknown) => void,
    ) => void;
  };
};

const fileFromEntry = (entry: FileSystemEntryLike): Promise<File> =>
  new Promise((resolve, reject) => {
    if (entry.file === undefined) {
      reject(new Error(`${entry.fullPath} has no file() method`));
      return;
    }
    entry.file(resolve, reject);
  });

/**
 * Reads every entry of a directory, paging through `readEntries` until it
 * reports empty — the entries API returns entries in batches rather than all
 * at once.
 */
const readAllEntries = (entry: FileSystemEntryLike): Promise<readonly FileSystemEntryLike[]> =>
  new Promise((resolve, reject) => {
    const reader = entry.createReader?.();
    if (reader === undefined) {
      resolve([]);
      return;
    }
    const collected: FileSystemEntryLike[] = [];
    const readNext = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(collected);
          return;
        }
        collected.push(...batch);
        readNext();
      }, reject);
    };
    readNext();
  });

/**
 * Relative path of an entry within the drop: `fullPath` starts with `/` and
 * counts from the dropped root, which is exactly the shape {@link PathedFile}
 * wants.
 */
const relativePathOf = (entry: FileSystemEntryLike): string => entry.fullPath.replace(/^\/+/, "");

const walkEntry = async (entry: FileSystemEntryLike): Promise<readonly PathedFile[]> => {
  if (entry.isFile) {
    const file = await fileFromEntry(entry);
    return [{ file, path: relativePathOf(entry) }];
  }
  if (!entry.isDirectory) return [];

  const children = await readAllEntries(entry);
  const nested = await Promise.all(children.map((child) => walkEntry(child)));
  return nested.flat();
};

/**
 * Collects every file from a drop, recursing into dropped directories.
 *
 * Uses the (non-standard but universally supported) `webkitGetAsEntry` entries
 * API when the browser offers it, so a dropped folder is walked recursively;
 * falls back to the flat `DataTransfer.files` list — no path, so nothing
 * dropped this way can be a Subagent sidecar — when it does not (older
 * browsers, and the `DataTransfer` test stand-in used by component tests).
 */
export const collectDataTransferEntries = async (
  dataTransfer: DataTransfer,
): Promise<readonly PathedFile[]> => {
  const items = dataTransfer.items as
    | Iterable<DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }>
    | undefined;

  if (items !== undefined) {
    const roots: FileSystemEntryLike[] = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry !== undefined && entry !== null) roots.push(entry);
    }
    if (roots.length > 0) {
      const nested = await Promise.all(roots.map((root) => walkEntry(root)));
      return nested.flat();
    }
  }

  return collectFileListEntries(dataTransfer.files);
};
