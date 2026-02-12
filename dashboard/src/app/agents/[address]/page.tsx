import { StatsCard } from "@/components/StatsCard";
import { EscrowTable } from "@/components/EscrowTable";
import { formatAmount, shortenAddress, type EscrowRow } from "@/lib/api";

const DEFAULT_AGENT_STATS = {
  agent_address: "",
  total_escrows: 0,
  completed_escrows: 0,
  disputed_escrows: 0,
  expired_escrows: 0,
  total_volume: 0,
  success_rate: 0,
  avg_completion_time: 0,
  last_active: null as string | null,
};

async function getAgentStats(address: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/agents/${address}/stats`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return { ...DEFAULT_AGENT_STATS, agent_address: address };
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return { ...DEFAULT_AGENT_STATS, agent_address: address };
    return await res.json();
  } catch {
    return { ...DEFAULT_AGENT_STATS, agent_address: address };
  }
}

async function getAgentEscrows(address: string): Promise<EscrowRow[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/agents/${address}/escrows?limit=50&offset=0`,
      { next: { revalidate: 10 } }
    );
    if (!res.ok) return [];
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function formatAvgCompletionTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

// ── Icons ──
const IconVault = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconCheck = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconPercent = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);
const IconDollar = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IconClock = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconDispute = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const [stats, escrows] = await Promise.all([
    getAgentStats(address),
    getAgentEscrows(address),
  ]);

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
            Back to escrows
          </a>
          <h1 className="text-[28px] font-bold tracking-tight">
            Agent Profile
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-[var(--surface)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-secondary)]">
              {shortenAddress(address, 8)}
            </span>
            <span className="rounded-lg bg-[var(--bg-subtle)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-tertiary)] break-all max-w-full">
              {address}
            </span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatsCard
          label="Total Escrows"
          value={stats.total_escrows.toLocaleString()}
          icon={IconVault}
          delay={0}
        />
        <StatsCard
          label="Completed"
          value={stats.completed_escrows.toLocaleString()}
          icon={IconCheck}
          delay={100}
        />
        <StatsCard
          label="Success Rate"
          value={stats.total_escrows > 0 ? `${stats.success_rate}%` : "—"}
          subtext={stats.total_escrows > 0 ? "Completion rate" : undefined}
          icon={IconPercent}
          delay={200}
        />
        <StatsCard
          label="Total Volume"
          value={`$${formatAmount(stats.total_volume)}`}
          subtext="USDC"
          icon={IconDollar}
          delay={300}
        />
        <StatsCard
          label="Avg Completion"
          value={formatAvgCompletionTime(stats.avg_completion_time)}
          subtext="Time to settle"
          icon={IconClock}
          delay={400}
        />
        <StatsCard
          label="Disputes"
          value={stats.disputed_escrows.toLocaleString()}
          icon={IconDispute}
          delay={500}
        />
      </section>

      {/* Activity history */}
      <section className="space-y-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Activity History
        </h2>
        <EscrowTable escrows={escrows} />
      </section>
    </div>
  );
}
