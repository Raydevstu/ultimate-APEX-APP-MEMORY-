import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/* ApexPad identity pairing (DESIGN.md §3) — engineering-document
   heritage: Plex Sans for UI, Plex Mono for data/receipts. */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ApexPad — Tier 1 Context & Memory Workbench",
  description:
    "Inspect, verify, and approve what your coding agent remembers, packs, and writes. Ripwire AST, Claude-Mem tiers, CCR blocks, DNA gates, and DAG approval — with receipts for every disk write.",
  keywords: [
    "ApexPad",
    "APEX-EDITOR-V1",
    "context engineering",
    "agent memory",
    "CCR",
    "Ripwire AST",
    "DNA Vault",
  ],
  authors: [{ name: "ApexPad" }],
  openGraph: {
    title: "ApexPad — Tier 1 Context & Memory Workbench",
    description:
      "Verify and approve what your coding agent remembers, packs, and writes — with receipts.",
    siteName: "ApexPad",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plexSans.variable} ${plexMono.variable} bg-vault text-ink antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
