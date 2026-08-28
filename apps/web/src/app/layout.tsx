import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { LaboratoryQueryProvider } from "@/components/query-provider";

import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "AI-Laboratorium",
    template: "%s · AI-Laboratorium",
  },
  description:
    "Et norsk laboratorium for reproduserbare AI-dueller og evolusjonære multi-agent-eksperimenter.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  initialScale: 1,
  themeColor: "#09090b",
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="antialiased">
        <LaboratoryQueryProvider>{children}</LaboratoryQueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
