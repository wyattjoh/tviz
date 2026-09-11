/**
 * Helpers shared by the component tests.
 *
 * Component tests run under jsdom (`@vitest-environment jsdom`), which has no
 * drag-and-drop implementation, so a drop has to be handed a stand-in
 * `DataTransfer`.
 */

/**
 * A `FileList` holding exactly the given files, which jsdom cannot construct.
 */
export const fileListOf = (...files: readonly File[]): FileList => {
  const list = {
    length: files.length,
    item: (index: number): File | null => files[index] ?? null,
    [Symbol.iterator]: () => files[Symbol.iterator](),
  };
  for (const [index, file] of files.entries()) {
    Object.defineProperty(list, index, { value: file, enumerable: true });
  }
  return list as unknown as FileList;
};

/**
 * A `.jsonl` {@link File} carrying synthetic transcript text.
 */
export const transcriptFile = (name: string, text: string): File =>
  new File([text], name, { type: "application/jsonl" });
