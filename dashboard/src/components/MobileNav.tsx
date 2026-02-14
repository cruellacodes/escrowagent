"use client";

import { useState, useEffect } from "react";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/escrows", label: "Escrows" },
  { href: "/disputes", label: "Disputes" },
  { href: "/analytics", label: "Analytics" },
  { href: "/docs", label: "Docs" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close on route change / escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-hover)] lg:hidden"
        aria-label="Toggle menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-72 flex-col gap-2 bg-[var(--bg)] p-6 pt-20 shadow-2xl transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)]"
          aria-label="Close menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {NAV_LINKS.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="rounded-xl px-4 py-3 text-[15px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-hover)] hover:text-white"
          >
            {label}
          </a>
        ))}

        <div className="my-2 h-px bg-[var(--border)]" />

        {/* Chain selector */}
        <div className="flex gap-2 px-2">
          <a
            href="/?chain=solana"
            onClick={() => setOpen(false)}
            className="flex-1 rounded-xl py-2.5 text-center text-[13px] font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            Solana
          </a>
          <a
            href="/?chain=base"
            onClick={() => setOpen(false)}
            className="flex-1 rounded-xl py-2.5 text-center text-[13px] font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            Base
          </a>
        </div>

        <div className="my-2 h-px bg-[var(--border)]" />

        <button className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[#9174ff] px-4 py-3 text-[14px] font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:brightness-110">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Connect
        </button>
      </div>
    </>
  );
}
