import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { MobileNav } from "@/components/MobileNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "EscrowAgent — Escrow Dashboard",
  description:
    "Trust & settlement layer for autonomous agent-to-agent transactions on Solana and Base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        {/* Ambient gradient blobs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-[40%] -left-[20%] h-[800px] w-[800px] rounded-full opacity-[0.04]"
            style={{ background: "radial-gradient(circle, #7c5cfc 0%, transparent 70%)" }}
          />
          <div
            className="absolute -bottom-[30%] -right-[10%] h-[600px] w-[600px] rounded-full opacity-[0.03]"
            style={{ background: "radial-gradient(circle, #a78bfa 0%, transparent 70%)" }}
          />
        </div>

        {/* Navigation */}
        <nav className="glass sticky top-0 z-50 border-b border-[var(--glass-border)] border-t-0 border-l-0 border-r-0">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
            <a href="/" className="flex items-center gap-2 group sm:gap-3">
              <img
                src="/logo.png"
                alt="EscrowAgent"
                className="h-8 w-8 rounded-lg object-cover transition-transform group-hover:scale-105"
              />
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                EscrowAgent
              </span>
              <span className="ml-1 hidden rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider sm:inline-flex">
                Beta
              </span>
            </a>

            {/* Desktop nav — hidden on mobile */}
            <div className="hidden items-center gap-1 lg:flex">
              {[
                { href: "/", label: "Dashboard" },
                { href: "/escrows", label: "Escrows" },
                { href: "/disputes", label: "Disputes" },
                { href: "/analytics", label: "Analytics" },
                { href: "/docs", label: "Docs" },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-hover)] hover:text-white"
                >
                  {label}
                </a>
              ))}
              {/* Chain Selector */}
              <div className="ml-3 h-5 w-px bg-[var(--border)]" />
              <div className="ml-2 flex items-center gap-1 rounded-lg bg-[var(--surface-hover)] p-0.5">
                <a
                  href="/?chain=solana"
                  className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  title="Solana"
                >
                  Solana
                </a>
                <a
                  href="/?chain=base"
                  className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  title="Base"
                >
                  Base
                </a>
              </div>
              <div className="ml-2 h-5 w-px bg-[var(--border)]" />
              <button className="ml-2 flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#9174ff] px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-[var(--accent)]/30 hover:brightness-110 active:scale-[0.98]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Connect
              </button>
            </div>

            {/* Mobile hamburger */}
            <MobileNav />
          </div>
        </nav>

        <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-20 border-t border-[var(--border)] py-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-[13px] text-[var(--text-tertiary)] sm:flex-row sm:justify-between sm:px-6">
            <span>EscrowAgent Protocol</span>
            <div className="flex flex-wrap justify-center gap-5">
              <a href="https://github.com/cruellacodes/escrowagent" className="hover:text-[var(--text-secondary)] transition-colors">GitHub</a>
              <a href="/docs" className="hover:text-[var(--text-secondary)] transition-colors">Docs</a>
              <a href="https://solscan.io/account/8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py?cluster=devnet" className="hover:text-[var(--text-secondary)] transition-colors">Solscan</a>
              <a href="https://basescan.org/address/0xddBC03546BcFDf55c550F5982BaAEB37202fEB11" className="hover:text-[var(--text-secondary)] transition-colors">Basescan</a>
            </div>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
