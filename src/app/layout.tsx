import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ReownProvider } from "@/lib/pay/reown-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-merkado",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Merkado Direct",
    template: "%s · Merkado Direct",
  },
  description:
    "Merkado Direct and Merkado Pay. Get future rent paid now. Amounts in XCG.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only fixed left-3 top-3 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only"
        >
          Skip to main content
        </a>
        <ReownProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </ReownProvider>
      </body>
    </html>
  );
}
