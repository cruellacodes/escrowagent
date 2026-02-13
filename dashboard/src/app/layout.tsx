import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EscrowAgent — Escrow Dashboard",
  description:
    "Trust & settlement layer for autonomous agent-to-agent transactions on Solana",
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
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
            <a href="/" className="flex items-center gap-3 group">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[#a78bfa] text-xs font-extrabold text-white shadow-lg shadow-[var(--accent)]/20 transition-transform group-hover:scale-105">
                EA
              </div>
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                EscrowAgent
              </span>
              <span className="ml-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider">
                Beta
              </span>
            </a>

            <div className="flex items-center gap-1">
              {[
                { href: "/", label: "Dashboard" },
                { href: "/escrows", label: "Escrows" },
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
              <div className="ml-3 h-5 w-px bg-[var(--border)]" />
              <button className="ml-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#9174ff] px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-[var(--accent)]/30 hover:brightness-110 active:scale-[0.98]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Connect
              </button>
            </div>
          </div>
        </nav>

        <main className="relative mx-auto max-w-7xl px-6 py-10">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-20 border-t border-[var(--border)] py-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 text-[13px] text-[var(--text-tertiary)]">
            <span>EscrowAgent Protocol</span>
            <div className="flex gap-5">
              <a href="https://github.com" className="hover:text-[var(--text-secondary)] transition-colors">GitHub</a>
              <a href="/docs" className="hover:text-[var(--text-secondary)] transition-colors">Docs</a>
              <a href="https://solscan.io" className="hover:text-[var(--text-secondary)] transition-colors">Solscan</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
