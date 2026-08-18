import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_DISPLAY_NAME, APP_SHORT_NAME } from "@/lib/config/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_DISPLAY_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: "/mobile",
    scope: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/avora-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
