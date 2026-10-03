import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Editable copy of server data that resets whenever the source object changes
 * (React's "adjust state when a prop changes" pattern — no effect, no cascading render).
 */
export function useDraft<S, D = S>(
  source: S | undefined,
  init: (s: S) => D,
): [D | undefined, Dispatch<SetStateAction<D | undefined>>] {
  const [prev, setPrev] = useState(source);
  const [draft, setDraft] = useState<D | undefined>(
    source === undefined ? undefined : init(source),
  );
  if (source !== prev) {
    setPrev(source);
    setDraft(source === undefined ? undefined : init(source));
  }
  return [draft, setDraft];
}
