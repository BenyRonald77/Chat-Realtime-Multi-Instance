import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat Realtime Multi-Instance",
  description: "Chat realtime dengan Redis Pub/Sub agar tetap bekerja lintas banyak instance server.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
