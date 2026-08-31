/**
 * The top menu bar and its File menu.
 *
 * The UI prototype settled on a File menu rather than a session sidebar, so
 * every way into the app that is not a drop lives here: this ticket puts
 * "load demo sessions" and "close all sessions" in it, and the folder ticket
 * adds the open/pick entries and the list of open Sessions beside them.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Props for {@link MenuBar}.
 */
export type MenuBarProps = {
  /**
   * Loads the bundled Demo Sessions.
   */
  readonly onLoadDemo: () => void;
  /**
   * Closes every open Session, or `undefined` when none is open.
   */
  readonly onClear: (() => void) | undefined;
  /**
   * True while a load is in flight, so the menu cannot start a second one.
   */
  readonly busy: boolean;
};

type MenuItemProps = {
  readonly label: string;
  readonly onSelect: (() => void) | undefined;
  readonly disabled: boolean;
};

const MenuItem = ({ label, onSelect, disabled }: MenuItemProps) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled || onSelect === undefined}
    onClick={onSelect}
    className="block w-full px-3 py-1.5 text-left text-ui-text-secondary hover:bg-ui-panel-hover hover:text-ui-text disabled:opacity-40 disabled:hover:bg-transparent"
  >
    {label}
  </button>
);

/**
 * The application chrome: the wordmark and the File menu.
 */
export const MenuBar = ({ onLoadDemo, onClear, busy }: MenuBarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const run = useCallback((action: () => void) => {
    setIsOpen(false);
    action();
  }, []);

  return (
    <div className="flex items-center gap-3 border-b border-ui-border bg-ui-shell px-3 py-1.5 font-mono text-xs">
      <span className="tracking-[0.18em] text-ui-text-faint uppercase">tviz</span>
      <div ref={menu} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className={`rounded px-2 py-0.5 ${
            isOpen ? "bg-ui-panel-active text-ui-text" : "text-ui-text-secondary hover:bg-ui-panel"
          }`}
        >
          file
        </button>
        {!isOpen ? null : (
          <div
            role="menu"
            aria-label="File"
            className="absolute top-full left-0 z-40 mt-1 w-[220px] overflow-hidden rounded border border-ui-border bg-ui-sunken py-1"
          >
            <MenuItem label="load demo sessions" onSelect={() => run(onLoadDemo)} disabled={busy} />
            <MenuItem
              label="close all sessions"
              onSelect={onClear === undefined ? undefined : () => run(onClear)}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  );
};
