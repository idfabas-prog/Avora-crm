import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/mobile/ServiceWorkerRegistration";
import { APP_DESCRIPTION, APP_DISPLAY_NAME } from "@/lib/config/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
