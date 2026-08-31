/**
 * Empty state: drop a `.jsonl` transcript, or pick one.
 */
import { useId, useState } from "react";

/**
 * Props for {@link DropZone}.
 */
export type DropZoneProps = {
  /**
   * Called with the transcript the user dropped or picked.
   */
  readonly onFile: (file: File) => void;
  /**
   * Name of the file being parsed, or `undefined` when idle.
   */
  readonly parsing: string | undefined;
  /**
   * Message from the last failed load.
   */
  readonly error: string | undefined;
};

const firstFile = (list: FileList | null): File | undefined => list?.item(0) ?? undefined;

/**
 * Drop target and file picker for a single transcript.
 */
export const DropZone = ({ onFile, parsing, error }: DropZoneProps) => {
  const [isOver, setIsOver] = useState(false);
  const inputId = useId();
  const isBusy = parsing !== undefined;

  return (
    <div className="flex min-h-full items-center justify-center p-8 font-mono">
      <div className="w-full max-w-[560px] space-y-6 text-center">
        <div className="text-sm text-ui-text-muted">tviz</div>

        <section
          onDragOver={(event) => {
            event.preventDefault();
            setIsOver(true);
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsOver(false);
            const file = firstFile(event.dataTransfer.files);
            if (file !== undefined) onFile(file);
          }}
          className={`rounded border border-dashed px-6 py-14 transition-colors ${
            isOver ? "border-ui-focus bg-ui-panel/40" : "border-ui-border-strong bg-ui-canvas"
          }`}
        >
          <div className="text-ui-text">
            {isBusy ? `parsing ${parsing}…` : "drop a .jsonl transcript"}
          </div>
          <div className="mt-2 text-xs text-ui-text-faint">
            a session file from ~/.claude/projects/
          </div>

          <div className="mt-6 flex justify-center gap-2 text-xs">
            <label
              htmlFor={inputId}
              className="cursor-pointer rounded border border-ui-border px-3 py-1.5 text-ui-text-secondary hover:bg-ui-panel"
            >
              choose a transcript
            </label>
            <input
              id={inputId}
              type="file"
              accept=".jsonl,application/jsonl,application/x-ndjson"
              className="sr-only"
              onChange={(event) => {
                const file = firstFile(event.target.files);
                if (file !== undefined) onFile(file);
                event.target.value = "";
              }}
            />
          </div>

          {error === undefined ? null : (
            <p role="alert" className="mt-6 text-xs text-ui-danger">
              {error}
            </p>
          )}
        </section>

        <p className="text-xs leading-relaxed text-ui-text-faint">
          transcripts are parsed in this tab only — nothing is uploaded, nothing is stored.
        </p>
      </div>
    </div>
  );
};
