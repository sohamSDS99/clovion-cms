import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clovion CMS",
  description: "Standalone headless content engine for the Clovion AI marketing site",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
