"use client";

import { useEffect, useState } from "react";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (installEvent: Event) => {
      installEvent.preventDefault();
      setEvent(installEvent as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event || dismissed) return null;

  return (
    <section className="mobile-install-prompt">
      <div>
        <strong>Install {APP_DISPLAY_NAME}</strong>
        <span>Add the mobile workspace to this device.</span>
      </div>
      <button
        className="primary-button"
        type="button"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          setDismissed(true);
        }}
      >
        Install
      </button>
      <button className="secondary-button" type="button" onClick={() => setDismissed(true)}>Later</button>
    </section>
  );
}
