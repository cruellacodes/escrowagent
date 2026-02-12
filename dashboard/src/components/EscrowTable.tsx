"use client";

import { EscrowRow, formatAmount, shortenAddress } from "@/lib/api";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    AwaitingProvider: "badge-awaiting",
    Active: "badge-active",
    ProofSubmitted: "badge-proof",
    Completed: "badge-completed",
    Disputed: "badge-disputed",
    Resolved: "badge-resolved",
    Expired: "badge-expired",
    Cancelled: "badge-cancelled",
  };
  return map[status] || "badge-expired";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    AwaitingProvider: "Awaiting",
    ProofSubmitted: "Proof",
  };
  return map[status] || status;
}

interface EscrowTableProps {
  escrows: EscrowRow[];
}

export function EscrowTable({ escrows }: EscrowTableProps) {
  if (escrows.length === 0) {
    return (
      <div className="glass glow-subtle animate-fade-up rounded-2xl p-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        </div>
        <p className="text-[15px] font-medium text-[var(--text-secondary)]">
          No escrows yet
        </p>
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-[var(--text-tertiary)]">
          Escrows will appear here once agents start transacting through the protocol
        </p>
      </div>
    );
  }

  return (
    <div className="glass glow-subtle animate-fade-up overflow-hidden rounded-2xl">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
            <th className="px-5 py-3.5 font-semibold">Escrow</th>
            <th className="px-5 py-3.5 font-semibold">Client</th>
            <th className="px-5 py-3.5 font-semibold">Provider</th>
            <th className="px-5 py-3.5 font-semibold text-right">Amount</th>
            <th className="px-5 py-3.5 font-semibold">Status</th>
            <th className="px-5 py-3.5 font-semibold text-right">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {escrows.map((escrow, i) => (
            <tr
              key={escrow.escrow_address}
              className="group border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              <td className="px-5 py-4">
                <a
                  href={`/escrows/${escrow.escrow_address}`}
                  className="font-mono text-[12px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent)] group-hover:underline underline-offset-2"
                >
                  {shortenAddress(escrow.escrow_address, 6)}
                </a>
              </td>
              <td className="px-5 py-4">
                <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                  {shortenAddress(escrow.client_address)}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className="font-mono text-[12px] text-[var(--text-secondary)]">
                  {shortenAddress(escrow.provider_address)}
                </span>
              </td>
              <td className="px-5 py-4 text-right">
                <span className="font-mono text-[13px] font-medium text-white">
                  {formatAmount(escrow.amount)}
                </span>
                <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">
                  USDC
                </span>
              </td>
              <td className="px-5 py-4">
                <span className={`badge ${statusBadge(escrow.status)}`}>
                  {statusLabel(escrow.status)}
                </span>
              </td>
              <td className="px-5 py-4 text-right text-[12px] text-[var(--text-tertiary)]">
                {new Date(escrow.deadline).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
