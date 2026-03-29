import { useEffect } from "react";

/**
 * Warns the user with a browser-native dialog when they try to leave the page
 * while there are unsaved changes (refresh, close tab, etc.).
 * 
 * Note: react-router navigation is handled separately via `useBlocker` or
 * a custom `<Prompt>` equivalent. This hook only handles the browser's
 * `beforeunload` event.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom messages but still show a dialog
      e.returnValue = "Você tem alterações não salvas. Deseja sair?";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}
