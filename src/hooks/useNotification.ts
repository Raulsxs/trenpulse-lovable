import { useCallback, useEffect, useRef } from "react";

const PERMISSION_ASKED_KEY = "tp_notification_permission_asked";

export function useNotification() {
  const permissionRef = useRef<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    permissionRef.current = Notification.permission;
  }, []);

  // Request permission silently (no prompt if already decided)
  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (permissionRef.current === "granted") return;
    if (permissionRef.current === "denied") return;
    // Only ask once
    if (localStorage.getItem(PERMISSION_ASKED_KEY)) return;
    localStorage.setItem(PERMISSION_ASKED_KEY, "1");
    const result = await Notification.requestPermission();
    permissionRef.current = result;
  }, []);

  // Show a notification only when the page is hidden (user is on another tab)
  const notify = useCallback((title: string, body: string, icon = "/favicon.ico") => {
    if (typeof Notification === "undefined") return;
    if (!document.hidden) return; // user is already watching, no need
    if (permissionRef.current !== "granted") return;
    try {
      const n = new Notification(title, { body, icon });
      // Auto-focus the tab when user clicks the notification
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Some browsers block notifications in certain contexts — fail silently
    }
  }, []);

  return { requestPermission, notify };
}
