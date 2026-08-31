/**
 * The Workbench's top region: the wordmark, the File menu, and the standing
 * statement that nothing leaves the tab.
 *
 * The File menu is where Sessions are opened and switched — Open files… and
 * Open folder… collect entries the same way the drop zone does
 * (`collectFileListEntries` / `collectDataTransferEntries`), and every open
 * Session is listed with its call count and peak so the grid can be switched
 * without a session sidebar.
 *
 * "Load demo sessions" is here too, so a reviewer with no transcript has the
 * same way in once the empty state's drop zone is gone.
 */
import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { peakMeasuredTotal, type Session } from "../domain/context.ts";
import { collectFileListEntries, type PathedFile } from "./collect-files.ts";
import { formatTokens } from "./format.ts";
import type { LoadErrorEntry, PendingEntry } from "./session-loader.ts";

/**
 * One line of the File menu.
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
    className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-xs text-ui-text-secondary hover:bg-ui-panel-hover hover:text-ui-text disabled:opacity-40 disabled:hover:bg-transparent"
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
    <div className="flex items-baseline gap-3 px-3 py-1.5 text-xs text-ui-text-secondary hover:bg-ui-panel-hover hover:text-ui-text">
      {/* The empty check gutter `MenuItem` reserves, so every row's label
          starts on the same column whether or not it can be checked. */}
      <span className="w-3 shrink-0" aria-hidden="true" />
      <label htmlFor={inputId} className="flex-1 cursor-pointer truncate">
        {label}
      </label>
      {hint === undefined ? null : (
        <span className="shrink-0 text-[10px] text-ui-text-faint">{hint}</span>
      )}
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
    </div>
  );
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
 * The File menu: open on click, closed by Escape or a click outside it.
 */
const FileMenu = ({
  sessions,
  selectedId,
  pending,
  errors,
  onFiles,
  onSelectSession,
  onCloseAll,
  onLoadDemo,
  demoBusy,
  demoLabels,
}: MenuBarProps) => {
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

  const close = () => setOpen(false);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${
          open ? "bg-ui-panel-active text-ui-text" : "text-ui-text-secondary hover:bg-ui-panel"
        }`}
      >
        File
        {/* Purely visual, and `aria-hidden` so it never joins the button's
            accessible name — visible without opening the menu, so a folder
            drop's progress and failures are noticed rather than hidden
            behind a click; the menu's own rows carry the accessible text. */}
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
      {/* The badges above are `aria-hidden` and only ever visible once the
          menu is open, so this always-mounted live region is what tells a
          screen-reader user a folder drop is still parsing or that files
          failed — independent of whether the menu happens to be open. */}
      <span aria-live="polite" className="sr-only">
        {pending.length === 0
          ? ""
          : `parsing ${pending.length} file${pending.length === 1 ? "" : "s"}…`}
        {errors.length === 0
          ? ""
          : ` ${errors.length} file${errors.length === 1 ? "" : "s"} failed to parse.`}
      </span>
      {!open ? null : (
        <div className="absolute top-full left-0 z-40 mt-1 w-[290px] overflow-hidden rounded-md border border-ui-border bg-ui-sunken py-1 shadow-lg">
          <PickerMenuItem
            label="Open files…"
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
          <div className="my-1 border-t border-ui-border" />
          <div className="px-3 py-1 text-[10px] tracking-wide text-ui-text-faint uppercase">
            Open sessions
          </div>
          {/* The placeholder and status rows below stand in the session rows'
              place, so they take the session rows' indent rather than the
              section heading's. */}
          {sessions.length === 0 ? (
            <div className="py-1.5 pr-3 pl-9 text-xs text-ui-text-faint">none</div>
          ) : (
            sessions.map((session) => (
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
            ))
          )}
          {pending.length === 0 ? null : (
            <div className="py-1.5 pr-3 pl-9 text-xs text-ui-text-faint">
              parsing {pending.length} file{pending.length === 1 ? "" : "s"}…
            </div>
          )}
          {!demoBusy ? null : (
            <div className="py-1.5 pr-3 pl-9 text-xs text-ui-text-faint">
              loading demo sessions…
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
                  className="py-1.5 pr-3 pl-9 text-xs text-ui-danger"
                >
                  {entry.fileName}
                </div>
              ))}
            </>
          )}
          <div className="my-1 border-t border-ui-border" />
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
 * The menu bar across the top of the Workbench.
 */
export const MenuBar = (props: MenuBarProps) => (
  <header
    aria-label="tviz"
    className="flex items-center gap-3 border-b border-ui-border bg-ui-shell px-3 py-1.5"
  >
    <span className="text-xs tracking-[0.18em] text-ui-text-faint uppercase">tviz</span>
    <FileMenu {...props} />
    <span className="ml-auto text-[11px] text-ui-text-faint">
      parsed in this tab · nothing uploaded or stored
    </span>
  </header>
);
