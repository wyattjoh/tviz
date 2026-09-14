/**
 * The Workbench's top region: the wordmark, static Session identity, and one
 * right-aligned file dropdown.
 *
 * The dropdown opens individual transcripts or folders, loads Demo Sessions,
 * switches among loaded Sessions, and closes Sessions. Both pickers feed the
 * same `collectFileListEntries` path as the drop zone.
 */
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { peakMeasuredTotal, type Session } from "../domain/context.ts";
import { collectFileListEntries, type PathedFile } from "./collect-files.ts";
import { formatTokens } from "./format.ts";
import { SessionHeader } from "./SessionHeader.tsx";
import type { LoadErrorEntry, PendingEntry } from "./session-loader.ts";

/**
 * One button row in the file dropdown.
 */
type MenuItemProps = {
  /**
   * What the item does, in the same words the finished menu will use.
   */
  readonly label: string;
  /**
   * Keyboard shortcut shown on the right.
   */
  readonly hint: string | undefined;
  /**
   * Runs the action and closes the menu.
   */
  readonly onClick: (() => void) | undefined;
  /**
   * Marks the row as the currently open Session.
   */
  readonly checked: boolean | undefined;
  readonly disabled: boolean | undefined;
};

const MenuItem = ({ label, hint, onClick, checked, disabled }: MenuItemProps) => (
  <button
    type="button"
    disabled={disabled === true || onClick === undefined}
    onClick={onClick}
    aria-pressed={checked}
    className="flex min-h-11 w-full touch-manipulation items-center gap-3 px-3 py-2.5 text-left text-sm text-ui-text-secondary hover:bg-ui-panel-hover hover:text-ui-text disabled:opacity-40 disabled:hover:bg-transparent md:min-h-0 md:items-baseline md:py-1.5 md:text-xs"
  >
    <span className="w-3 shrink-0 self-center text-ui-focus" aria-hidden="true">
      {checked === true ? <Check className="h-3 w-3" /> : null}
    </span>
    <span className="truncate">{label}</span>
    {hint === undefined ? null : (
      <span className="ml-auto shrink-0 text-[10px] text-ui-text-faint">{hint}</span>
    )}
  </button>
);

/**
 * A hidden file input behind a menu-styled label, opened by clicking the
 * label — the same picker pattern the empty state's `DropZone` uses.
 */
type PickerMenuItemProps = {
  readonly label: string;
  readonly hint: string | undefined;
  readonly directory: boolean;
  readonly onFiles: (entries: readonly PathedFile[]) => void;
  readonly onPicked: () => void;
};

const PickerMenuItem = ({ label, hint, directory, onFiles, onPicked }: PickerMenuItemProps) => {
  const inputId = useId();
  return (
    <>
      <label
        htmlFor={inputId}
        className="flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 px-3 py-2.5 text-sm text-ui-text-secondary hover:bg-ui-panel-hover hover:text-ui-text md:min-h-0 md:items-baseline md:py-1.5 md:text-xs"
      >
        {/* The empty check gutter `MenuItem` reserves, so every row's label
            starts on the same column whether or not it can be checked. */}
        <span className="w-3 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{label}</span>
        {hint === undefined ? null : (
          <span className="shrink-0 text-[10px] text-ui-text-faint">{hint}</span>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept={directory ? undefined : ".jsonl,application/jsonl,application/x-ndjson"}
        className="sr-only"
        // `webkitdirectory` is non-standard but universally supported;
        // `lib.dom` does not type it on `<input>`.
        {...(directory ? ({ webkitdirectory: "" } as Record<string, string>) : {})}
        onChange={(event) => {
          onFiles(collectFileListEntries(event.target.files));
          event.target.value = "";
          onPicked();
        }}
      />
    </>
  );
};

/**
 * Shared open/close behavior for the two top-bar menus.
 */
const useDismissibleMenu = () => {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { container, open, setOpen } as const;
};

/**
 * Props for {@link MenuBar}.
 */
export type MenuBarProps = {
  /**
   * Every open Session, in load order.
   */
  readonly sessions: readonly Session[];
  /**
   * The Session the grid currently shows.
   */
  readonly selectedId: string | undefined;
  /**
   * Transcripts still parsing.
   */
  readonly pending: readonly PendingEntry[];
  /**
   * Transcripts that failed to parse.
   */
  readonly errors: readonly LoadErrorEntry[];
  /**
   * Queues dropped or picked entries the same way the empty state does.
   */
  readonly onFiles: (entries: readonly PathedFile[]) => void;
  /**
   * Switches which Session the grid shows.
   */
  readonly onSelectSession: (id: string) => void;
  /**
   * Closes the selected Session while leaving the other Sessions open.
   */
  readonly onCloseSession: (id: string) => void;
  /**
   * Closes every open Session and returns to the empty state.
   */
  readonly onCloseAll: () => void;
  /**
   * Loads the bundled Demo Sessions.
   */
  readonly onLoadDemo: () => void;
  /**
   * True while a demo load is in flight, so the menu cannot start a second.
   */
  readonly demoBusy: boolean;
  /**
   * Manifest name per Demo Session id. A Session in this map is synthetic, so
   * the menu says so on its row rather than showing the demo's file name.
   */
  readonly demoLabels: ReadonlyMap<string, string>;
};

/**
 * The single file dropdown, labeled by the selected Session when one is open.
 */
const FileDropdown = ({
  selectedSession,
  sessions,
  selectedId,
  pending,
  errors,
  onFiles,
  onSelectSession,
  onCloseSession,
  onCloseAll,
  onLoadDemo,
  demoBusy,
  demoLabels,
}: MenuBarProps & { readonly selectedSession: Session | undefined }) => {
  const { container, open, setOpen } = useDismissibleMenu();
  const close = () => setOpen(false);

  return (
    <div ref={container} className="relative ml-auto min-w-0">
      <button
        type="button"
        title={selectedSession?.fileName}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex min-h-11 max-w-full min-w-0 touch-manipulation items-center gap-1.5 rounded px-3 text-right text-sm md:min-h-0 md:px-2 md:py-0.5 md:text-xs ${
          open
            ? "bg-ui-panel-active text-ui-text"
            : selectedSession === undefined
              ? "text-ui-text-secondary hover:bg-ui-panel"
              : "text-ui-focus hover:bg-ui-panel"
        }`}
      >
        <span className="truncate">{selectedSession?.fileName ?? "File"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        {pending.length === 0 ? null : (
          <span
            aria-hidden="true"
            className="rounded-full bg-ui-action px-1.5 text-[10px] text-ui-shell"
          >
            {pending.length}
          </span>
        )}
        {errors.length === 0 ? null : (
          <span
            aria-hidden="true"
            className="rounded-full bg-ui-danger px-1.5 text-[10px] text-ui-shell"
          >
            {errors.length}
          </span>
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {pending.length === 0
          ? ""
          : `parsing ${pending.length} file${pending.length === 1 ? "" : "s"}…`}
        {errors.length === 0
          ? ""
          : ` ${errors.length} file${errors.length === 1 ? "" : "s"} failed to parse.`}
      </span>
      {!open ? null : (
        <div className="absolute top-full right-0 z-40 mt-1 max-h-[calc(100dvh-4rem)] w-[calc(100vw-1.5rem)] max-w-[340px] overflow-y-auto rounded-md border border-ui-border bg-ui-sunken py-1 shadow-lg md:w-[290px]">
          <PickerMenuItem
            label="Open session…"
            hint={undefined}
            directory={false}
            onFiles={onFiles}
            onPicked={close}
          />
          <PickerMenuItem
            label="Open folder…"
            hint={undefined}
            directory={true}
            onFiles={onFiles}
            onPicked={close}
          />
          <MenuItem
            label="Load demo sessions"
            hint={undefined}
            checked={undefined}
            disabled={demoBusy}
            onClick={() => {
              onLoadDemo();
              close();
            }}
          />
          {!demoBusy ? null : (
            <div className="min-h-11 py-2.5 pr-3 pl-9 text-sm text-ui-text-faint md:min-h-0 md:py-1.5 md:text-xs">
              loading demo sessions…
            </div>
          )}
          {sessions.length === 0 ? null : (
            <>
              <div className="my-1 border-t border-ui-border" />
              <div className="px-3 py-1 text-[10px] tracking-wide text-ui-text-faint uppercase">
                Open sessions
              </div>
            </>
          )}
          {sessions.map((session) => (
            <MenuItem
              key={session.id}
              label={
                demoLabels.has(session.id)
                  ? `${demoLabels.get(session.id)} (demo)`
                  : session.fileName
              }
              hint={`${session.calls.length} · ${formatTokens(peakMeasuredTotal(session.calls))}`}
              checked={session.id === selectedId}
              disabled={false}
              onClick={() => {
                onSelectSession(session.id);
                close();
              }}
            />
          ))}
          {pending.length === 0 ? null : (
            <div className="min-h-11 py-2.5 pr-3 pl-9 text-sm text-ui-text-faint md:min-h-0 md:py-1.5 md:text-xs">
              parsing {pending.length} file{pending.length === 1 ? "" : "s"}…
            </div>
          )}
          {errors.length === 0 ? null : (
            <>
              <div className="my-1 border-t border-ui-border" />
              <div className="px-3 py-1 text-[10px] tracking-wide text-ui-text-faint uppercase">
                Failed
              </div>
              {errors.map((entry) => (
                <div
                  key={entry.id}
                  role="alert"
                  className="min-h-11 py-2.5 pr-3 pl-9 text-sm text-ui-danger md:min-h-0 md:py-1.5 md:text-xs"
                >
                  {entry.fileName}
                </div>
              ))}
            </>
          )}
          <div className="my-1 border-t border-ui-border" />
          <MenuItem
            label="Close session"
            hint={undefined}
            checked={undefined}
            disabled={selectedId === undefined}
            onClick={
              selectedId === undefined
                ? undefined
                : () => {
                    onCloseSession(selectedId);
                    close();
                  }
            }
          />
          <MenuItem
            label="Close all sessions"
            hint={undefined}
            checked={undefined}
            disabled={sessions.length === 0}
            onClick={
              sessions.length === 0
                ? undefined
                : () => {
                    onCloseAll();
                    close();
                  }
            }
          />
        </div>
      )}
    </div>
  );
};

/**
 * The menu bar across the top of the Workbench, including the active Session.
 */
export const MenuBar = (props: MenuBarProps) => {
  const selectedSession = props.sessions.find((session) => session.id === props.selectedId);

  return (
    <header
      aria-label="tviz"
      className="flex min-w-0 items-center gap-3 border-b border-ui-border bg-ui-shell px-3 py-1.5"
    >
      <span className="shrink-0 text-xs tracking-[0.18em] text-ui-text-faint uppercase">tviz</span>
      {selectedSession === undefined ? (
        <FileDropdown {...props} selectedSession={undefined} />
      ) : (
        <SessionHeader
          session={selectedSession}
          sessionMenu={<FileDropdown {...props} selectedSession={selectedSession} />}
        />
      )}
    </header>
  );
};
