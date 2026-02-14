import { shortenAddress, formatAmount } from "@/lib/api";

async function getEscrow(address: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/escrows/${address}`,
      { next: { revalidate: 10 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

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

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[13px] text-[var(--text-tertiary)]">{label}</span>
      <span
        className={`text-[13px] text-white ${mono ? "font-mono text-[12px]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function EscrowDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const escrow = await getEscrow(address);

  if (!escrow) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center animate-fade-up">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Escrow Not Found</h1>
        <p className="mt-2 text-[14px] text-[var(--text-secondary)]">
          This escrow doesn&apos;t exist or hasn&apos;t been indexed yet.
        </p>
        <a
          href="/escrows"
          className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent)] hover:underline underline-offset-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to escrows
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <a
            href="/escrows"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Escrows
          </a>
          <h1 className="text-[28px] font-bold tracking-tight">
            Escrow Detail
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="rounded-lg bg-[var(--surface)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-secondary)]">
              {address}
            </span>
            <span className={`badge ${statusBadge(escrow.status)}`}>
              {escrow.status}
            </span>
            {escrow.tx_signature && !escrow.tx_signature.startsWith("0xSEED") && (
              <a
                href={
                  escrow.chain === "base"
                    ? `https://${process.env.NEXT_PUBLIC_BASE_NETWORK === "mainnet" ? "" : "sepolia."}basescan.org/tx/${escrow.tx_signature}`
                    : `https://solscan.io/tx/${escrow.tx_signature}${process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "" : "?cluster=devnet"}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)] hover:text-white"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View on {escrow.chain === "base" ? "Basescan" : "Solscan"}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 animate-fade-up animate-delay-1">
        {/* Participants */}
        <div className="glass glow-subtle rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h2 className="text-[14px] font-semibold">Participants</h2>
          </div>
          <InfoRow label="Client (Agent A)" value={shortenAddress(escrow.client_address, 8)} mono />
          <InfoRow label="Provider (Agent B)" value={shortenAddress(escrow.provider_address, 8)} mono />
          {escrow.arbitrator_address && (
            <InfoRow label="Arbitrator" value={shortenAddress(escrow.arbitrator_address, 8)} mono />
          )}
        </div>

        {/* Financials */}
        <div className="glass glow-subtle rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <h2 className="text-[14px] font-semibold">Financials</h2>
          </div>
          <InfoRow label="Escrowed Amount" value={`${formatAmount(escrow.amount)} USDC`} />
          <InfoRow label="Protocol Fee" value={`${escrow.protocol_fee_bps / 100}%`} />
          <InfoRow label="Verification" value={escrow.verification_type} />
          <InfoRow label="Token Mint" value={shortenAddress(escrow.token_mint, 6)} mono />
        </div>

        {/* Timing */}
        <div className="glass glow-subtle rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <h2 className="text-[14px] font-semibold">Timing</h2>
          </div>
          <InfoRow label="Created" value={new Date(escrow.created_at).toLocaleString()} />
          <InfoRow label="Deadline" value={new Date(escrow.deadline).toLocaleString()} />
          <InfoRow label="Grace Period" value={`${escrow.grace_period}s`} />
          {escrow.completed_at && (
            <InfoRow label="Completed" value={new Date(escrow.completed_at).toLocaleString()} />
          )}
        </div>

        {/* Task */}
        <div className="glass glow-subtle rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2 className="text-[14px] font-semibold">Task</h2>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-[12px] text-[var(--text-tertiary)]">Task Hash</span>
              <p className="mt-1 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)] break-all">
                {escrow.task_hash}
              </p>
            </div>
            {escrow.task && (
              <div>
                <span className="text-[12px] text-[var(--text-tertiary)]">Description</span>
                <p className="mt-1 text-[13px] leading-relaxed text-white">
                  {escrow.task.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Proofs */}
      {escrow.proofs && escrow.proofs.length > 0 && (
        <div className="glass glow-subtle animate-fade-up animate-delay-2 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h2 className="text-[14px] font-semibold">Proof Submissions</h2>
          </div>
          <div className="space-y-3">
            {escrow.proofs.map((proof: any, i: number) => (
              <div
                key={i}
                className="rounded-xl bg-[var(--bg-subtle)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="badge badge-proof">{proof.proof_type}</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    {new Date(proof.submitted_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-3 rounded-lg bg-[var(--bg)] p-3 font-mono text-[11px] text-[var(--text-secondary)] break-all">
                  {proof.proof_data}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
