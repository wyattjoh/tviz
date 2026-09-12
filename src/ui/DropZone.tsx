/**
 * Empty state: the panel that invites a transcript — pick files with a picker,
 * load the bundled Demo Sessions, or drop a file anywhere in the window.
 *
 * The drop itself is not handled here. The whole landing page is the drop
 * target, so `App`'s root owns the drag handlers and hands this panel `isOver`
 * to draw with; a second handler on this section would bubble to that root and
 * import every dropped file twice. What is left here is the pickers, which
 * forward raw paired files, and the progress and errors it is handed —
 * `partitionEntries` downstream (in `useSessionLoader`) is what tells a
 * transcript apart from a Subagent Session sidecar.
 */
import { useId } from "react";
import { collectFileListEntries, type PathedFile } from "./collect-files.ts";
import type { LoadErrorEntry, PendingEntry } from "./session-loader.ts";

/**
 * Props for {@link DropZone}.
 */
export type DropZoneProps = {
  /**
   * Called with every file the user picked, paired with its path
   * (folder-relative when it came from a directory). Dropped files arrive
   * through `App`'s root instead.
   */
  readonly onFiles: (entries: readonly PathedFile[]) => void;
  /**
   * Whether a drag is currently over the window, so the panel can show it is
   * a target. Purely visual: the drop is handled whether or not this is on.
   */
  readonly isOver: boolean;
  /**
   * Whether a Demo Session is showing behind the panel, so the note below it
   * can name that Session rather than describe demo data in the abstract.
   */
  readonly previewing: boolean;
  /**
   * Transcripts still parsing.
   */
  readonly pending: readonly PendingEntry[];
  /**
   * Transcripts that failed to parse, one row per file.
   */
  readonly errors: readonly LoadErrorEntry[];
  /**
   * Called when someone asks for the bundled Demo Sessions.
   */
  readonly onLoadDemo: () => void;
  /**
   * Which Demo Session is being fetched, or `undefined` when no demo load is
   * in flight.
   */
  readonly demoProgress: string | undefined;
  /**
   * Why the last demo load failed, or `undefined`.
   */
  readonly demoError: string | undefined;
};

/**
 * The panel that invites a transcript: pickers, the demo, and what is loading.
 */
export const DropZone = ({
  onFiles,
  isOver,
  previewing,
  pending,
  errors,
  onLoadDemo,
  demoProgress,
  demoError,
}: DropZoneProps) => {
  const filesInputId = useId();
  const folderInputId = useId();
  const isBusy = pending.length > 0 || demoProgress !== undefined;

  return (
    <div className="flex h-full min-h-full items-center justify-center p-8 font-mono">
      <div className="w-full max-w-[560px] space-y-6 text-center">
        <section
          className={`rounded border border-dashed px-6 py-14 backdrop-blur-sm transition-colors ${
            isOver ? "border-ui-focus bg-ui-panel/80" : "border-ui-border-strong bg-ui-canvas/90"
          }`}
        >
          <div className="text-ui-text">
            {demoProgress !== undefined
              ? `parsing ${demoProgress}…`
              : isBusy
                ? pending.length === 1
                  ? `parsing ${pending[0]?.fileName}…`
                  : `parsing ${pending.length} files…`
                : "drop a .jsonl transcript"}
          </div>
          <div className="mt-2 text-xs text-ui-text-muted">
            anywhere in this window — a file, or a whole project folder from ~/.claude/projects/
          </div>

          <div className="mt-6 flex justify-center gap-2 text-xs">
            <label
              htmlFor={filesInputId}
              className="cursor-pointer rounded border border-ui-border px-3 py-1.5 text-ui-text-secondary hover:bg-ui-panel"
            >
              choose files
            </label>
            <input
              id={filesInputId}
              type="file"
              multiple
              accept=".jsonl,application/jsonl,application/x-ndjson"
              className="sr-only"
              onChange={(event) => {
                onFiles(collectFileListEntries(event.target.files));
                event.target.value = "";
              }}
            />

            <label
              htmlFor={folderInputId}
              className="cursor-pointer rounded border border-ui-border px-3 py-1.5 text-ui-text-secondary hover:bg-ui-panel"
            >
              choose a folder
            </label>
            <input
              id={folderInputId}
              type="file"
              multiple
              className="sr-only"
              // `webkitdirectory` is non-standard but universally supported;
              // `lib.dom` does not type it on `<input>`.
              {...({ webkitdirectory: "" } as Record<string, string>)}
              onChange={(event) => {
                onFiles(collectFileListEntries(event.target.files));
                event.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={onLoadDemo}
              disabled={isBusy}
              className="rounded border border-ui-focus px-3 py-1.5 text-ui-focus hover:bg-ui-panel disabled:opacity-50"
            >
              load demo sessions
            </button>
          </div>

          {demoError === undefined ? null : (
            <p role="alert" className="mt-6 text-xs text-ui-danger">
              {demoError}
            </p>
          )}

          {errors.length === 0 ? null : (
            <ul className="mt-6 space-y-1 text-left text-xs">
              {errors.map((entry) => (
                <li key={entry.id} role="alert" className="text-ui-danger">
                  {entry.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs leading-relaxed text-ui-text-faint">
          transcripts are parsed in this tab only — nothing is uploaded, nothing is stored.
        </p>
        {/* Short by necessity: the manifest, which carries the full statement,
            is only fetched once someone asks for the Demo Sessions. Its
            `note` is what the loaded view shows.

            When the preview is up it is named here rather than left to be
            guessed at: a blurred session behind a drop panel must not be
            mistaken for anyone's own transcript. */}
        <p className="text-xs leading-relaxed text-ui-text-faint">
          {previewing
            ? "the session behind this panel, like every demo session, is"
            : "the demo sessions are"}{" "}
          synthetic: real record structure and token counts, every word replaced with placeholder
          text.
        </p>
      </div>
    </div>
  );
};
