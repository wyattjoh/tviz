/**
 * In-memory state for every Session the user has opened: which are parsed,
 * which are still parsing, which failed, and the Subagent Session counts a
 * folder drop reveals — merged onto their parent regardless of the order the
 * parent and the sidecar directory happened to be discovered in.
 *
 * Nothing here touches storage: closing the tab (or calling {@link
 * SessionLoader.closeAll}) is the only way state here goes away.
 * `session-loader.test.ts`'s "never touches a storage API" test is what
 * pins that claim — it spies on `localStorage`, `sessionStorage` and
 * `indexedDB` across a full load/select/close cycle, so a future edit that
 * starts persisting the Session list fails the suite instead of shipping
 * quietly.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { Session } from "../domain/context.ts";
import { parseTranscriptFile } from "../worker/parse-client.ts";
import { type PathedFile, partitionEntries } from "./collect-files.ts";

/**
 * A transcript still being parsed.
 *
 * `id` is unique per queued entry (not per `path`): the same path can be
 * queued twice — the same file dropped twice, or two sidecars that happen to
 * share a name — and each queued copy must resolve independently rather than
 * one resolution clearing both rows.
 */
export type PendingEntry = {
  readonly id: string;
  readonly path: string;
  readonly fileName: string;
};

/**
 * A transcript that failed to parse, with the parser's user-visible message.
 * `id` carries the same per-entry uniqueness {@link PendingEntry.id} does.
 */
export type LoadErrorEntry = {
  readonly id: string;
  readonly path: string;
  readonly fileName: string;
  readonly message: string;
};

/**
 * Everything the Workbench needs to open Sessions and show progress on them.
 */
export type SessionLoader = {
  /**
   * Every Session parsed so far, Subagent Session counts already merged in.
   */
  readonly sessions: readonly Session[];
  /**
   * Transcripts still parsing, in the order they were queued.
   */
  readonly pending: readonly PendingEntry[];
  /**
   * Transcripts that failed to parse, one row per file.
   */
  readonly errors: readonly LoadErrorEntry[];
  /**
   * The Session the grid should show, or `undefined` before anything loaded.
   */
  readonly selectedId: string | undefined;
  /**
   * Queues a batch of dropped or picked entries: `.jsonl` files are parsed,
   * Subagent Session sidecars are counted onto their parent, and everything
   * else is dropped silently.
   */
  readonly addEntries: (entries: readonly PathedFile[]) => void;
  /**
   * Switches which Session the grid shows.
   */
  readonly selectSession: (id: string) => void;
  /**
   * Closes one Session (and, if it had one, its Subagent Session count).
   * Leaves every other open Session and any in-flight parse alone. If the
   * closed Session was the one on screen, another open Session is selected in
   * its place — falling back to the empty state only once none are left.
   */
  readonly closeSession: (id: string) => void;
  /**
   * Discards every Session, in-flight parse, and error, and returns to the
   * empty state.
   */
  readonly closeAll: () => void;
};

const withoutId =
  (id: string) =>
  (current: readonly PendingEntry[]): readonly PendingEntry[] =>
    current.filter((entry) => entry.id !== id);

/**
 * Owns the Session list: parsing runs through the same Worker client a single
 * dropped file uses, queued rather than awaited so several files parse
 * concurrently and progress is visible per file.
 */
export const useSessionLoader = (): SessionLoader => {
  const [rawSessions, setRawSessions] = useState<ReadonlyMap<string, Session>>(new Map());
  // Keyed by parent Session id, holding each sidecar's `sidecarId` (the path
  // from `subagents/` down). A `Set` rather than a running count: the same
  // sidecar can be discovered twice — the same folder dropped again, or a
  // subdirectory re-dropped after its parent folder already contributed it —
  // and a `Set` absorbs the repeat instead of counting it again.
  const [subagentPaths, setSubagentPaths] = useState<ReadonlyMap<string, ReadonlySet<string>>>(
    new Map(),
  );
  const [pending, setPending] = useState<readonly PendingEntry[]>([]);
  const [errors, setErrors] = useState<readonly LoadErrorEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // Bumped by closeAll so a parse that resolves after the user closed
  // everything cannot resurrect a Session or a stale error row.
  const epochRef = useRef(0);
  // Gives every queued entry an id distinct from its `path`, so two entries
  // that share a path (the same file dropped twice) resolve independently
  // instead of one resolution's cleanup removing both rows.
  const nextEntryIdRef = useRef(0);

  const addEntries = useCallback((entries: readonly PathedFile[]) => {
    const partition = partitionEntries(entries);
    const epoch = epochRef.current;

    if (partition.subagentPaths.size > 0) {
      setSubagentPaths((current) => {
        const next = new Map(current);
        for (const [parentId, sidecars] of partition.subagentPaths) {
          const merged = new Set(next.get(parentId) ?? []);
          for (const sidecarId of sidecars) merged.add(sidecarId);
          next.set(parentId, merged);
        }
        return next;
      });
    }

    for (const entry of partition.transcripts) {
      const id = String(nextEntryIdRef.current++);
      setPending((current) => [...current, { id, path: entry.path, fileName: entry.file.name }]);

      parseTranscriptFile(entry.file).then((outcome) => {
        if (epochRef.current !== epoch) return;
        setPending(withoutId(id));

        if (outcome.ok) {
          const session = outcome.session;
          setRawSessions((current) => {
            const next = new Map(current);
            next.set(session.id, session);
            return next;
          });
          setSelectedId((current) => current ?? session.id);
        } else {
          setErrors((current) => [
            ...current,
            { id, path: entry.path, fileName: entry.file.name, message: outcome.message },
          ]);
        }
      });
    }
  }, []);

  const selectSession = useCallback((id: string) => setSelectedId(id), []);

  const closeSession = useCallback((id: string) => {
    // Captured by `setRawSessions`'s updater, which React runs synchronously
    // when `closeSession` is called — read below by `setSelectedId`'s updater
    // so the fallback selection is never a render behind the removal.
    let remainingIds: readonly string[] = [];
    setRawSessions((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      remainingIds = Array.from(next.keys());
      return next;
    });
    setSubagentPaths((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    setSelectedId((current) => (current === id ? remainingIds[0] : current));
  }, []);

  const closeAll = useCallback(() => {
    epochRef.current += 1;
    setRawSessions(new Map());
    setSubagentPaths(new Map());
    setPending([]);
    setErrors([]);
    setSelectedId(undefined);
  }, []);

  // Subagent counts arrive independently of the order a folder drop happens
  // to walk its entries in, so they are merged here rather than baked into
  // the parsed Session.
  const sessions = useMemo(
    () =>
      Array.from(rawSessions.values(), (session) => ({
        ...session,
        subagentCount: subagentPaths.get(session.id)?.size ?? session.subagentCount,
      })),
    [rawSessions, subagentPaths],
  );

  return {
    sessions,
    pending,
    errors,
    selectedId,
    addEntries,
    selectSession,
    closeSession,
    closeAll,
  };
};
