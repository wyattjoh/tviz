/**
 * A scrolling region that says when it has more to show.
 *
 * The rail's legend and the Inspector's item list both outrun their box, and on
 * a phone an Info Pane is short enough that the overflow is easy to miss
 * entirely — there is no scrollbar to notice on a touch device. This draws a
 * fade over each edge that has content past it and takes it away again at the
 * ends, so the region always says which way it continues.
 *
 * Two elements rather than one, and for a reason worth remembering: the fade is
 * `absolute` and the scroll is `overflow-y-auto`, and an element cannot both
 * clip its overflow and paint something positioned against its edges. So the
 * wrapper positions and the inner element scrolls. Putting the two on one
 * element is how the rail lost its outer fade once already.
 */
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Props for {@link ScrollArea}.
 */
export type ScrollAreaProps = {
  /**
   * Classes for the wrapper, which is what gives the region its size — a fixed
   * height, or `flex-1` inside a column.
   */
  readonly className?: string;
  /**
   * Classes for the scrolling element itself, for padding and inner layout.
   */
  readonly innerClassName?: string;
  /**
   * Inline styles for the scrolling element, for values that are not classes.
   */
  readonly style?: React.CSSProperties;
  /**
   * What scrolls.
   */
  readonly children: ReactNode;
};

/**
 * A region that scrolls, with a fade over each edge it has more past.
 */
export const ScrollArea = ({
  className = "",
  innerClassName = "",
  style,
  children,
}: ScrollAreaProps) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const [moreAbove, setMoreAbove] = useState(false);

  const measure = useCallback(() => {
    const element = scroller.current;
    if (element === null) return;
    // A pixel of slack: fractional heights make an exact comparison flicker on
    // the last row.
    const below = element.scrollHeight - element.scrollTop - element.clientHeight > 1;
    setMoreBelow((was) => (was === below ? was : below));
    const above = element.scrollTop > 1;
    setMoreAbove((was) => (was === above ? was : above));
  }, []);

  // After every render, because what scrolls here changes with the Session and
  // with every filter toggle — there is no prop that could be depended on
  // instead. The body is two property reads and a guarded `setState`.
  useEffect(measure);

  // And on resize, for the changes no render accompanies: rotating the device,
  // or the pane's own max-height following the viewport.
  useEffect(() => {
    const element = scroller.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const onScroll = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      void event;
      measure();
    },
    [measure],
  );

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scroller}
        onScroll={onScroll}
        style={style}
        className={`h-full overflow-y-auto ${innerClassName}`}
      >
        {children}
      </div>

      {/* Both edges, so the region says which way it has more. Fading to the
          pane's own surface rather than the canvas: this sits inside an Info
          Pane, where `bg-ui-sunken` is the backdrop. `pointer-events-none`
          keeps the rows they cover clickable through them. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-ui-sunken to-transparent transition-opacity duration-200 motion-reduce:transition-none ${
          moreAbove ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-ui-sunken to-transparent transition-opacity duration-200 motion-reduce:transition-none ${
          moreBelow ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};
