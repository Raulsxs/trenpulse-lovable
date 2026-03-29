import { useEffect, useRef, useCallback, useState } from "react";
import { saveDraft, loadDraft, clearDraft, DraftData } from "@/lib/slideUtils";

interface UseDraftOptions {
  draftKey: string | null;
  enabled?: boolean;
  debounceMs?: number;
}

interface UseDraftReturn {
  /** Pending draft loaded from storage (null if none or already consumed) */
  pendingDraft: DraftData | null;
  /** Accept and consume the pending draft */
  restoreDraft: () => DraftData | null;
  /** Discard the pending draft */
  discardDraft: () => void;
  /** Save current state to draft */
  saveToDraft: (data: Omit<DraftData, "savedAt">) => void;
  /** Clear the draft */
  clear: () => void;
  /** Whether there are unsaved changes since last save */
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
}

export function useDraft({ draftKey, enabled = true, debounceMs = 1000 }: UseDraftOptions): UseDraftReturn {
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(draftKey);
  keyRef.current = draftKey;

  // Load draft on mount / key change
  useEffect(() => {
    if (!draftKey || !enabled) {
      setPendingDraft(null);
      return;
    }
    const draft = loadDraft(draftKey);
    if (draft) {
      setPendingDraft(draft);
    }
  }, [draftKey, enabled]);

  const saveToDraft = useCallback((data: Omit<DraftData, "savedAt">) => {
    if (!keyRef.current || !enabled) return;
    const key = keyRef.current;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(key, { ...data, savedAt: Date.now() });
      setHasUnsavedChanges(false);
    }, debounceMs);

    setHasUnsavedChanges(true);
  }, [enabled, debounceMs]);

  const restoreDraft = useCallback(() => {
    const draft = pendingDraft;
    setPendingDraft(null);
    return draft;
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    if (keyRef.current) clearDraft(keyRef.current);
    setPendingDraft(null);
  }, []);

  const clear = useCallback(() => {
    if (keyRef.current) clearDraft(keyRef.current);
    setPendingDraft(null);
    setHasUnsavedChanges(false);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { pendingDraft, restoreDraft, discardDraft, saveToDraft, clear, hasUnsavedChanges, setHasUnsavedChanges };
}
