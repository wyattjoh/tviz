/**
 * Session and selected-API-Call facts derived from the loaded transcript.
 *
 * This panel deliberately stays on the parser's plain-data side of the Worker
 * boundary. It shows when the Session ran, how many API Calls and Compactions
 * it contains, parse-health counts, and the context items that entered the API
 * Call selected by the Scrubber. It does not retain or render raw prompt, reply,
 * or tool-result text.
 */
import type { ContextItem, ContextSnapshot, Session } from "../domain/context.ts";
import { formatTimestamp, formatTokens } from "./format.ts";
import { CATEGORY_FILL_CLASS, MESSAGE_KIND_FILL_CLASS } from "./theme.ts";

/**
 * Props for {@link TranscriptPanel}.
 */
export type TranscriptPanelProps = {
  /**
   * The loaded Session whose transcript facts are being described.
   */
  readonly session: Session;
  /**
   * The API Call currently selected by the Scrubber.
   */
  readonly snapshot: ContextSnapshot;
  /**
   * The Demo Session manifest's synthetic-data statement, when applicable.
   */
  readonly demoNote: string | undefined;
};

const countUnknownRecords = (session: Session): number =>
  Object.values(session.unknownRecordTypes).reduce((sum, count) => sum + count, 0);

const plural = (count: number, singular: string): string =>
  `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;

const parseDate = (timestamp: string): Date | undefined => {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const formatTime = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 60_000) return "<1m";

  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h${remainingMinutes === 0 ? "" : ` ${remainingMinutes}m`}`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d${remainingHours === 0 ? "" : ` ${remainingHours}h`}`;
};

const sessionSpan = (calls: readonly ContextSnapshot[]): string | undefined => {
  const timestamps = calls.flatMap((call) =>
    call.timestamp === undefined ? [] : [call.timestamp],
  );
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps.at(-1);
  if (firstTimestamp === undefined || lastTimestamp === undefined) return undefined;

  const first = parseDate(firstTimestamp);
  const last = parseDate(lastTimestamp);
  if (first === undefined || last === undefined) {
    return firstTimestamp === lastTimestamp
      ? formatTimestamp(firstTimestamp)
      : `${formatTimestamp(firstTimestamp)}–${formatTimestamp(lastTimestamp)}`;
  }

  const range =
    first.toDateString() === last.toDateString()
      ? `${formatDate(first)} · ${formatTime(first)}–${formatTime(last)}`
      : `${formatDate(first)} ${formatTime(first)}–${formatDate(last)} ${formatTime(last)}`;
  const elapsed = last.getTime() - first.getTime();
  return elapsed < 0 ? range : `${range} · ${formatDuration(elapsed)}`;
};

const itemFillClass = (item: ContextItem): string =>
  item.category === "messages" && item.kind !== undefined
    ? MESSAGE_KIND_FILL_CLASS[item.kind]
    : CATEGORY_FILL_CLASS[item.category];

type ItemRowProps = {
  readonly item: ContextItem;
};

const ItemRow = ({ item }: ItemRowProps) => (
  <li className="flex items-baseline gap-2 rounded bg-ui-canvas px-2 py-1 text-[11px]">
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 self-center rounded-[2px] ${itemFillClass(item)}`}
    />
    <span className="min-w-0 flex-1 truncate text-ui-text-secondary" title={item.label}>
      {item.label}
    </span>
    <span className="shrink-0 text-ui-text-faint tabular-nums">{formatTokens(item.tokens)}</span>
  </li>
);

/**
 * Shows Session-level transcript facts and the items added on the selected API
 * Call, staying synchronized with the Scrubber through `snapshot`.
 */
export const TranscriptPanel = ({ session, snapshot, demoNote }: TranscriptPanelProps) => {
  const compactions = session.calls.filter((call) => call.compaction).length;
  const span = sessionSpan(session.calls);
  const unknownRecords = countUnknownRecords(session);
  const added = snapshot.added.filter((item) => item.tokens > 0);
  const callState = snapshot.compaction ? "compaction" : snapshot.reset ? "reset" : undefined;
  const selectedDate = snapshot.timestamp === undefined ? undefined : parseDate(snapshot.timestamp);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs text-ui-text">
          {plural(session.calls.length, "API Call")} · {plural(compactions, "Compaction")}
        </p>
        {span === undefined ? null : (
          <p className="text-[11px] leading-snug text-ui-text-muted">{span}</p>
        )}
        <p className="text-[11px] leading-snug text-ui-text-faint">
          {plural(session.recordCount, "record")} · {session.malformedLines.toLocaleString()}{" "}
          malformed · {unknownRecords.toLocaleString()} unknown
        </p>
      </div>

      <section className="border-t border-ui-border pt-2" aria-label="Selected API Call details">
        <h3 className="text-[10px] font-semibold tracking-wide text-ui-text-muted uppercase">
          Selected API Call {snapshot.index + 1} of {session.calls.length}
        </h3>
        <p className="mt-1 flex min-w-0 items-baseline gap-1 text-[11px] text-ui-text-faint">
          <span className="min-w-0 truncate" title={snapshot.model}>
            {snapshot.model ?? "Model not recorded"}
          </span>
          {snapshot.timestamp === undefined ? null : (
            <>
              <span aria-hidden="true">·</span>
              <time className="shrink-0" dateTime={snapshot.timestamp}>
                {selectedDate === undefined
                  ? formatTimestamp(snapshot.timestamp)
                  : formatTime(selectedDate)}
              </time>
            </>
          )}
          {callState === undefined ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{callState}</span>
            </>
          )}
        </p>

        <p className="mt-2 text-[10px] font-semibold tracking-wide text-ui-text-faint uppercase">
          Context added
        </p>
        {added.length === 0 ? (
          <p className="mt-1 text-[11px] leading-snug text-ui-text-faint">
            No new context items recorded on this API Call.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {added.map((item, index) => (
              <ItemRow key={`${index}-${item.category}-${item.label}`} item={item} />
            ))}
          </ul>
        )}
      </section>

      {demoNote === undefined ? null : (
        <p className="border-t border-ui-border pt-2 text-[11px] leading-snug text-ui-text-faint">
          {demoNote}
        </p>
      )}
    </div>
  );
};
