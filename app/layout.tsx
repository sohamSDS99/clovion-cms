import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Typography pairing for the "Refined editorial admin" direction:
 *  - Fraunces: a characterful display serif for headings + the wordmark.
 *  - Hanken Grotesk: a clean, modern, non-Inter sans for UI + body.
 * Exposed as CSS variables consumed by globals.css / tailwind.config.ts.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clovion CMS",
  description:
    "Standalone headless content engine for the Clovion AI marketing site",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
