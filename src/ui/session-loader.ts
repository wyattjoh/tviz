/**
 * In-memory state for every Session the user has opened: which are parsed,
 * which are still parsing, which failed, and the Subagent Session counts a
 * folder drop reveals — merged onto their parent regardless of the order the
 * parent and the sidecar directory happened to be discovered in.
 *
 * Nothing here touches storage: closing the tab (or calling {@link
 * SessionLoader.closeAll}) is the only way state here goes away.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { Session } from "../domain/context.ts";
import { parseTranscriptFile } from "../worker/parse-client.ts";
import { type PathedFile, partitionEntries } from "./collect-files.ts";

/**
 * A transcript still being parsed.
 */
export type PendingEntry = {
  readonly path: string;
  readonly fileName: string;
};

/**
 * A transcript that failed to parse, with the parser's user-visible message.
 */
export type LoadErrorEntry = {
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
   * Discards every Session, in-flight parse, and error, and returns to the
   * empty state.
   */
  readonly closeAll: () => void;
};

const withoutPath =
  (path: string) =>
  (current: readonly PendingEntry[]): readonly PendingEntry[] =>
    current.filter((entry) => entry.path !== path);

/**
 * Owns the Session list: parsing runs through the same Worker client a single
 * dropped file uses, queued rather than awaited so several files parse
 * concurrently and progress is visible per file.
 */
export const useSessionLoader = (): SessionLoader => {
  const [rawSessions, setRawSessions] = useState<ReadonlyMap<string, Session>>(new Map());
  const [subagentCounts, setSubagentCounts] = useState<ReadonlyMap<string, number>>(new Map());
  const [pending, setPending] = useState<readonly PendingEntry[]>([]);
  const [errors, setErrors] = useState<readonly LoadErrorEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // Bumped by closeAll so a parse that resolves after the user closed
  // everything cannot resurrect a Session or a stale error row.
  const epochRef = useRef(0);

  const addEntries = useCallback((entries: readonly PathedFile[]) => {
    const partition = partitionEntries(entries);
    const epoch = epochRef.current;

    if (partition.subagentCounts.size > 0) {
      setSubagentCounts((current) => {
        const next = new Map(current);
        for (const [parentId, count] of partition.subagentCounts) {
          next.set(parentId, (next.get(parentId) ?? 0) + count);
        }
        return next;
      });
    }

    for (const entry of partition.transcripts) {
      setPending((current) => [...current, { path: entry.path, fileName: entry.file.name }]);

      parseTranscriptFile(entry.file).then((outcome) => {
        if (epochRef.current !== epoch) return;
        setPending(withoutPath(entry.path));

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
            { path: entry.path, fileName: entry.file.name, message: outcome.message },
          ]);
        }
      });
    }
  }, []);

  const selectSession = useCallback((id: string) => setSelectedId(id), []);

  const closeAll = useCallback(() => {
    epochRef.current += 1;
    setRawSessions(new Map());
    setSubagentCounts(new Map());
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
        subagentCount: subagentCounts.get(session.id) ?? session.subagentCount,
      })),
    [rawSessions, subagentCounts],
  );

  return { sessions, pending, errors, selectedId, addEntries, selectSession, closeAll };
};
