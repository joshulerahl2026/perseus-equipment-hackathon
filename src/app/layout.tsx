import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Perseus Equipment | Service Opportunity Finder",
  description:
    "Dealer operations analytics: which customers to call, which service to pitch, and what it is worth, benchmarked against comparable customers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <TooltipProvider delay={150}>
          <AppShell
            footer={
              <>
                Read-only analytics over the dealer management database. Revenue counts posted invoices only
                (finalized and archived).
              </>
            }
          >
            {children}
          </AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
