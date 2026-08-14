import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Merkado Labs · Rent Advance",
    template: "%s · Merkado Labs",
  },
  description:
    "Labs demo of Merkado Rent Advance and Merkado Direct. A sale of rent receivables, not a loan. Not live on merkado.cw.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/cw-logo.png", type: "image/png" }],
    apple: [{ url: "/cw-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only fixed left-3 top-3 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only"
        >
          Skip to main content
        </a>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
