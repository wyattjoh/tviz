/**
 * Empty state: drop a `.jsonl` transcript or a whole project folder, or pick
 * files with a picker.
 *
 * A dropped folder is walked recursively (`collectDataTransferEntries`);
 * `partitionEntries` downstream (in `useSessionLoader`) is what tells a
 * transcript apart from a Subagent Session sidecar, so this component only
 * ever forwards raw paired files and reports progress/errors it is handed.
 */
import { useId, useState } from "react";
import {
  collectDataTransferEntries,
  collectFileListEntries,
  type PathedFile,
} from "./collect-files.ts";
import type { LoadErrorEntry, PendingEntry } from "./session-loader.ts";

/**
 * Props for {@link DropZone}.
 */
export type DropZoneProps = {
  /**
   * Called with every file the user dropped or picked, paired with its path
   * (folder-relative when it came from a directory).
   */
  readonly onFiles: (entries: readonly PathedFile[]) => void;
  /**
   * Transcripts still parsing.
   */
  readonly pending: readonly PendingEntry[];
  /**
   * Transcripts that failed to parse, one row per file.
   */
  readonly errors: readonly LoadErrorEntry[];
};

/**
 * Drop target and file/folder pickers for one or more transcripts.
 */
export const DropZone = ({ onFiles, pending, errors }: DropZoneProps) => {
  const [isOver, setIsOver] = useState(false);
  const filesInputId = useId();
  const folderInputId = useId();
  const isBusy = pending.length > 0;

  return (
    <div className="flex h-full min-h-full items-center justify-center p-8 font-mono">
      <div className="w-full max-w-[560px] space-y-6 text-center">
        <section
          onDragOver={(event) => {
            event.preventDefault();
            setIsOver(true);
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsOver(false);
            // Must read `dataTransfer` synchronously in this handler; the walk
            // of a dropped folder's entries is what stays async.
            collectDataTransferEntries(event.dataTransfer).then(onFiles);
          }}
          className={`rounded border border-dashed px-6 py-14 transition-colors ${
            isOver ? "border-ui-focus bg-ui-panel/40" : "border-ui-border-strong bg-ui-canvas"
          }`}
        >
          <div className="text-ui-text">
            {isBusy
              ? pending.length === 1
                ? `parsing ${pending[0]?.fileName}…`
                : `parsing ${pending.length} files…`
              : "drop a .jsonl transcript"}
          </div>
          <div className="mt-2 text-xs text-ui-text-muted">
            or a whole project folder — session files from ~/.claude/projects/
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
          </div>

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
      </div>
    </div>
  );
};
