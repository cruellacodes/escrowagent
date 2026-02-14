import { formatAmount, shortenAddress } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function getDisputes() {
  try {
    const res = await fetch(`${API_URL}/escrows?status=Disputed`, { next: { revalidate: 10 } });
    if (!res.ok) return [];
    const disputed = await res.json();

    const res2 = await fetch(`${API_URL}/escrows?status=Resolved`, { next: { revalidate: 10 } });
    const resolved = res2.ok ? await res2.json() : [];

    return [...disputed, ...resolved];
  } catch {
    return [];
  }
}

async function getDisputeDetails(escrowAddress: string) {
  try {
    const res = await fetch(`${API_URL}/escrows/${escrowAddress}/dispute`, { next: { revalidate: 10 } });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-[var(--surface)]">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] text-[var(--text-tertiary)]">{pct}%</span>
    </div>
  );
}

export default async function DisputesPage() {
  const escrows = await getDisputes();

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="space-y-2">
        <h1 className="text-[28px] font-bold tracking-tight text-white">Disputes</h1>
        <p className="text-[14px] text-[var(--text-secondary)]">
          AI-powered dispute resolution. The arbitrator agent analyzes evidence and issues rulings automatically.
        </p>
      </div>

      {escrows.length === 0 ? (
        <div className="glass glow-subtle rounded-2xl p-10 text-center">
          <p className="text-[16px] text-[var(--text-secondary)]">No disputes yet</p>
          <p className="mt-2 text-[13px] text-[var(--text-tertiary)]">
            Disputes will appear here when agents raise them on escrows.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {escrows.map(async (escrow: any) => {
            const disputes = await getDisputeDetails(escrow.escrow_address);
            const dispute = disputes[0];

            return (
              <div key={escrow.escrow_address} className="glass glow-subtle rounded-2xl p-6 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <a
                        href={`/escrows/${escrow.escrow_address}`}
                        className="text-[16px] font-bold text-white hover:text-[var(--accent)]"
                      >
                        Escrow #{escrow.escrow_address}
                      </a>
                      <span className={`badge ${escrow.status === "Disputed" ? "badge-disputed" : "badge-resolved"}`}>
                        {escrow.status}
                      </span>
                      {escrow.chain && (
                        <span className="rounded-full bg-blue-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-400">
                          {escrow.chain}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
                      {formatAmount(escrow.amount)} USDC &middot; {shortenAddress(escrow.client_address, 6)} vs {shortenAddress(escrow.provider_address, 6)}
                    </p>
                  </div>
                </div>

                {/* Dispute Details */}
                {dispute && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Dispute Reason</p>
                      <p className="mt-1 text-[13px] text-white">{dispute.reason || "No reason provided"}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                        Raised by {shortenAddress(dispute.raised_by, 6)} &middot; {new Date(dispute.raised_at).toLocaleString()}
                      </p>
                    </div>

                    {/* AI Ruling */}
                    {dispute.ai_ruling && (
                      <div className="rounded-xl bg-[var(--accent-soft)] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">AI Arbitrator Ruling</p>
                          {confidenceBar(parseFloat(dispute.ai_confidence || "0"))}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`rounded-lg px-3 py-1.5 text-[13px] font-bold ${
                            dispute.ai_ruling === "PayProvider" ? "bg-green-500/20 text-green-400" :
                            dispute.ai_ruling === "PayClient" ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-purple-500/20 text-purple-400"
                          }`}>
                            {dispute.ai_ruling}
                          </span>
                          {dispute.resolved_on_chain && (
                            <span className="text-[11px] text-green-400">Submitted on-chain</span>
                          )}
                        </div>

                        <p className="text-[13px] leading-relaxed text-white">
                          {dispute.ai_reasoning}
                        </p>

                        {dispute.resolution_tx && (
                          <a
                            href={
                              escrow.chain === "base"
                                ? `https://${process.env.NEXT_PUBLIC_BASE_NETWORK === "mainnet" ? "" : "sepolia."}basescan.org/tx/${dispute.resolution_tx}`
                                : `https://solscan.io/tx/${dispute.resolution_tx}${process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet" ? "" : "?cluster=devnet"}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
                          >
                            View transaction
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Pending AI Analysis */}
                    {!dispute.ai_ruling && escrow.status === "Disputed" && (
                      <div className="rounded-xl bg-[var(--surface)] p-4">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                          </span>
                          <p className="text-[13px] text-[var(--text-secondary)]">
                            AI Arbitrator is analyzing this dispute...
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
