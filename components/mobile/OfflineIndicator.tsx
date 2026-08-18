"use client";

import { useEffect, useState } from "react";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [seenOffline, setSeenOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => {
      setOnline(false);
      setSeenOffline(true);
    };
    if (!navigator.onLine) {
      handleOffline();
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online && !seenOffline) return null;

  return (
    <div className={online ? "offline-banner online" : "offline-banner"} role="status">
      {online ? "Back online" : `Offline. Drafts can be preserved, but critical ${APP_DISPLAY_NAME} actions require connection.`}
    </div>
  );
}
