/**
 * Empty state: drop a `.jsonl` transcript, pick one, or load the bundled
 * Demo Sessions.
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
   * Called when the reviewer asks for the bundled Demo Sessions.
   */
  readonly onLoadDemo: () => void;
  /**
   * What is being loaded right now, or `undefined` when idle.
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
export const DropZone = ({ onFile, onLoadDemo, parsing, error }: DropZoneProps) => {
  const [isOver, setIsOver] = useState(false);
  const inputId = useId();
  const isBusy = parsing !== undefined;

  return (
    <div className="flex flex-1 items-center justify-center p-8 font-mono">
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
          <div className="mt-2 text-xs text-ui-text-muted">
            a session file from ~/.claude/projects/
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
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
            <button
              type="button"
              onClick={onLoadDemo}
              disabled={isBusy}
              className="rounded border border-ui-focus px-3 py-1.5 text-ui-focus hover:bg-ui-panel disabled:opacity-50"
            >
              load demo sessions
            </button>
          </div>

          <div className="mt-2 text-[11px] text-ui-text-faint">
            no transcript to hand? three bundled sessions, small to large
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
        {/* Short by necessity: the manifest, which carries the full statement,
            is only fetched once the reviewer asks for the Demo Sessions. Its
            `note` is what the loaded view shows. */}
        <p className="text-xs leading-relaxed text-ui-text-faint">
          the demo sessions are synthetic: real record structure and token counts, every word
          replaced with placeholder text.
        </p>
      </div>
    </div>
  );
};
