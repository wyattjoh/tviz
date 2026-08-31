/**
 * The Workbench's top region: the wordmark, the File menu, and the standing
 * statement that nothing leaves the tab.
 *
 * The menu is where Sessions are opened once the Session list exists; until
 * then its items are listed and disabled, so the region is the shape it will
 * keep and the drop path stays the only way in.
 */
import { useEffect, useRef, useState } from "react";

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
};

const MenuItem = ({ label, hint }: MenuItemProps) => (
  <button
    type="button"
    disabled
    className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-xs text-ui-text-secondary disabled:opacity-40"
  >
    <span className="truncate">{label}</span>
    {hint === undefined ? null : (
      <span className="ml-auto shrink-0 text-[10px] text-ui-text-faint">{hint}</span>
    )}
  </button>
);

/**
 * The File menu: open on click, closed by Escape or a click outside it.
 */
const FileMenu = () => {
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

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`rounded px-2 py-0.5 text-xs ${
          open ? "bg-ui-panel-active text-ui-text" : "text-ui-text-secondary hover:bg-ui-panel"
        }`}
      >
        File
      </button>
      {!open ? null : (
        <div className="absolute top-full left-0 z-40 mt-1 w-[290px] overflow-hidden rounded-md border border-ui-border bg-ui-sunken py-1 shadow-lg">
          <MenuItem label="Open files…" hint="⌘O" />
          <MenuItem label="Open folder…" hint="⇧⌘O" />
          <MenuItem label="Load demo sessions" hint={undefined} />
          <div className="my-1 border-t border-ui-border" />
          <p className="px-3 py-1 text-[10px] leading-snug text-ui-text-faint">
            Opening Sessions from here arrives with the Session list. Drop a transcript on the
            window for now.
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * The menu bar across the top of the Workbench.
 */
export const MenuBar = () => (
  <header
    aria-label="tviz"
    className="flex items-center gap-3 border-b border-ui-border bg-ui-shell px-3 py-1.5"
  >
    <span className="text-xs tracking-[0.18em] text-ui-text-faint uppercase">tviz</span>
    <FileMenu />
    <span className="ml-auto text-[11px] text-ui-text-faint">
      parsed in this tab · nothing uploaded or stored
    </span>
  </header>
);
