import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Butterfly — Cascading Effects Engine",
  description: "Perpetual research engine for tracking cascading effects of world events",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
