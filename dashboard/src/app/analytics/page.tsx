import { StatsCard } from "@/components/StatsCard";
import {
  formatAmount,
  shortenAddress,
  withAnalyticsBaseline,
  type AnalyticsData,
  type ChainMetrics,
  type ChainPerformance,
} from "@/lib/api";

// ── Data fetchers ──

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const emptyChain: ChainMetrics = {
  totalEscrows: 0, completed: 0, active: 0, disputed: 0,
  cancelled: 0, expired: 0, totalVolume: 0, settledVolume: 0, lockedVolume: 0,
};
const emptyPerf: ChainPerformance = {
  completionRate: 0, disputeRate: 0, avgCompletionSeconds: 0,
};

async function getAnalytics(): Promise<AnalyticsData> {
  try {
    const res = await fetch(`${API_URL}/analytics`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return {
      chains: {}, performance: {}, activeAgents: 0,
      topAgents: [], weeklyTrend: [], dailyVolume: [],
    };
  }
}

async function getNpmDownloads(): Promise<Record<string, number>> {
  const pkgs = ["escrowagent", "escrowagent-sdk", "escrowagent-agent-tools"];
  const results: Record<string, number> = {};
  await Promise.all(
    pkgs.map(async (pkg) => {
      try {
        const res = await fetch(
          `https://api.npmjs.org/downloads/point/last-month/${pkg}`,
          { next: { revalidate: 3600 } }
        );
        if (res.ok) {
          const data = await res.json();
          results[pkg] = data.downloads || 0;
        } else {
          results[pkg] = 0;
        }
      } catch {
        results[pkg] = 0;
      }
    })
  );
  return results;
}

// ── Icons ──

const IconDownload = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconTrend = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);
const IconUsers = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconCheck = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconLock = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconAlert = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconClock = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconPackage = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function ChainBadge({ chain }: { chain: string }) {
  const color = chain === "base" ? "text-blue-400 bg-blue-400/10" : "text-purple-400 bg-purple-400/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${color}`}>
      {chain}
    </span>
  );
}

// ── Bar chart (pure CSS) ──

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-[var(--surface)]">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function AnalyticsPage() {
  const [rawAnalytics, npm] = await Promise.all([getAnalytics(), getNpmDownloads()]);
  const analytics = withAnalyticsBaseline(rawAnalytics);

  const solana = analytics.chains["solana"] || emptyChain;
  const baseChain = analytics.chains["base"] || emptyChain;
  const totalEscrows = solana.totalEscrows + baseChain.totalEscrows;
  const totalVolume = solana.totalVolume + baseChain.totalVolume;
  const totalSettled = solana.settledVolume + baseChain.settledVolume;
  const totalLocked = solana.lockedVolume + baseChain.lockedVolume;
  const totalCompleted = solana.completed + baseChain.completed;
  const totalDisputed = solana.disputed + baseChain.disputed;
  const totalNpmDownloads = Object.values(npm).reduce((a, b) => a + b, 0);

  const solPerf = analytics.performance["solana"] || emptyPerf;
  const basePerf = analytics.performance["base"] || emptyPerf;

  return (
    <div className="space-y-12 animate-fade-up">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-[32px] font-extrabold tracking-tight text-white">Protocol Analytics</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          Real-time metrics across Solana and Base. Updated every 60 seconds.
        </p>
      </div>

      {/* ── Top-level KPIs ── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Escrows"
          value={totalEscrows.toLocaleString()}
          subtext={`${solana.totalEscrows} Solana / ${baseChain.totalEscrows} Base`}
          icon={IconLock}
          delay={0}
        />
        <StatsCard
          label="Total Volume"
          value={`$${formatAmount(totalVolume)}`}
          subtext={`$${formatAmount(totalLocked)} locked`}
          icon={IconTrend}
          delay={50}
        />
        <StatsCard
          label="Active Agents"
          value={analytics.activeAgents.toLocaleString()}
          subtext="last 30 days"
          icon={IconUsers}
          delay={100}
        />
        <StatsCard
          label="npm Downloads"
          value={totalNpmDownloads.toLocaleString()}
          subtext="last month"
          icon={IconDownload}
          delay={150}
        />
      </section>

      {/* ── npm Breakdown ── */}
      <section className="glass glow-subtle rounded-2xl p-6 space-y-4">
        <h2 className="text-[16px] font-bold text-white">npm Package Downloads</h2>
        <p className="text-[13px] text-[var(--text-tertiary)]">Monthly downloads from npm registry</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Object.entries(npm).map(([pkg, downloads]) => (
            <div key={pkg} className="rounded-xl bg-[var(--surface)] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                    {IconPackage}
                  </div>
                  <code className="text-[13px] text-white">{pkg}</code>
                </div>
                <span className="text-[20px] font-bold text-white">{downloads.toLocaleString()}</span>
              </div>
              <MiniBar value={downloads} max={Math.max(...Object.values(npm), 1)} color="bg-[var(--accent)]" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Chain Comparison ── */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Solana */}
        <div className="glass glow-subtle rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-white">Solana</h2>
            <ChainBadge chain="solana" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Escrows</p>
              <p className="text-[24px] font-bold text-white">{solana.totalEscrows.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Volume</p>
              <p className="text-[24px] font-bold text-white">${formatAmount(solana.totalVolume)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Completion Rate</p>
              <p className="text-[24px] font-bold text-[var(--success)]">{solPerf.completionRate}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Dispute Rate</p>
              <p className="text-[24px] font-bold text-[var(--danger)]">{solPerf.disputeRate}%</p>
            </div>
          </div>
          <div className="space-y-2 text-[13px] text-[var(--text-secondary)]">
            <div className="flex justify-between"><span>Settled</span><span className="text-white">${formatAmount(solana.settledVolume)}</span></div>
            <div className="flex justify-between"><span>Locked (TVL)</span><span className="text-white">${formatAmount(solana.lockedVolume)}</span></div>
            <div className="flex justify-between"><span>Avg completion</span><span className="text-white">{formatSeconds(solPerf.avgCompletionSeconds)}</span></div>
          </div>
          {/* Status breakdown bar */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Status Breakdown</p>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface)]">
              {solana.totalEscrows > 0 && (
                <>
                  <div className="bg-green-500" style={{ width: `${(solana.completed / solana.totalEscrows) * 100}%` }} title={`Completed: ${solana.completed}`} />
                  <div className="bg-blue-500" style={{ width: `${(solana.active / solana.totalEscrows) * 100}%` }} title={`Active: ${solana.active}`} />
                  <div className="bg-red-500" style={{ width: `${(solana.disputed / solana.totalEscrows) * 100}%` }} title={`Disputed: ${solana.disputed}`} />
                  <div className="bg-gray-500" style={{ width: `${((solana.cancelled + solana.expired) / solana.totalEscrows) * 100}%` }} title={`Cancelled/Expired: ${solana.cancelled + solana.expired}`} />
                </>
              )}
            </div>
            <div className="flex gap-4 text-[11px] text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Completed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Active</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Disputed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-500" /> Other</span>
            </div>
          </div>
        </div>

        {/* Base */}
        <div className="glass glow-subtle rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-white">Base</h2>
            <ChainBadge chain="base" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Escrows</p>
              <p className="text-[24px] font-bold text-white">{baseChain.totalEscrows.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Volume</p>
              <p className="text-[24px] font-bold text-white">${formatAmount(baseChain.totalVolume)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Completion Rate</p>
              <p className="text-[24px] font-bold text-[var(--success)]">{basePerf.completionRate}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-[var(--text-tertiary)]">Dispute Rate</p>
              <p className="text-[24px] font-bold text-[var(--danger)]">{basePerf.disputeRate}%</p>
            </div>
          </div>
          <div className="space-y-2 text-[13px] text-[var(--text-secondary)]">
            <div className="flex justify-between"><span>Settled</span><span className="text-white">${formatAmount(baseChain.settledVolume)}</span></div>
            <div className="flex justify-between"><span>Locked (TVL)</span><span className="text-white">${formatAmount(baseChain.lockedVolume)}</span></div>
            <div className="flex justify-between"><span>Avg completion</span><span className="text-white">{formatSeconds(basePerf.avgCompletionSeconds)}</span></div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Status Breakdown</p>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface)]">
              {baseChain.totalEscrows > 0 && (
                <>
                  <div className="bg-green-500" style={{ width: `${(baseChain.completed / baseChain.totalEscrows) * 100}%` }} />
                  <div className="bg-blue-500" style={{ width: `${(baseChain.active / baseChain.totalEscrows) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(baseChain.disputed / baseChain.totalEscrows) * 100}%` }} />
                  <div className="bg-gray-500" style={{ width: `${((baseChain.cancelled + baseChain.expired) / baseChain.totalEscrows) * 100}%` }} />
                </>
              )}
            </div>
            <div className="flex gap-4 text-[11px] text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Completed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Active</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Disputed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-500" /> Other</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Performance Summary ── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Completed" value={totalCompleted.toLocaleString()} subtext="all chains" icon={IconCheck} delay={0} />
        <StatsCard label="Disputed" value={totalDisputed.toLocaleString()} subtext="all chains" icon={IconAlert} delay={50} />
        <StatsCard label="Settled Volume" value={`$${formatAmount(totalSettled)}`} subtext="paid out to providers" icon={IconTrend} delay={100} />
        <StatsCard label="TVL Locked" value={`$${formatAmount(totalLocked)}`} subtext="in active escrows" icon={IconLock} delay={150} />
      </section>

      {/* ── Weekly Trend (table) ── */}
      {analytics.weeklyTrend.length > 0 && (
        <section className="glass glow-subtle rounded-2xl p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-white">Weekly Trend</h2>
          <p className="text-[13px] text-[var(--text-tertiary)]">Escrows created and volume per week (last 12 weeks)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="pb-3 pr-4">Week</th>
                  <th className="pb-3 pr-4">Chain</th>
                  <th className="pb-3 pr-4 text-right">Escrows</th>
                  <th className="pb-3 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-secondary)]">
                {analytics.weeklyTrend.map((row, i) => (
                  <tr key={`${row.week}-${row.chain}`} className="border-b border-[var(--border)]/50">
                    <td className="py-2.5 pr-4 text-white">{new Date(row.week).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td className="py-2.5 pr-4"><ChainBadge chain={row.chain} /></td>
                    <td className="py-2.5 pr-4 text-right font-medium text-white">{row.escrowsCreated}</td>
                    <td className="py-2.5 text-right font-medium text-white">${formatAmount(row.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Daily Volume Sparkline (CSS bars) ── */}
      {analytics.dailyVolume.length > 0 && (
        <section className="glass glow-subtle rounded-2xl p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-white">Daily Activity</h2>
          <p className="text-[13px] text-[var(--text-tertiary)]">Escrows created per day (last 30 days)</p>
          <div className="flex items-end gap-1 h-32">
            {analytics.dailyVolume.map((d) => {
              const maxEscrows = Math.max(...analytics.dailyVolume.map((x) => x.escrows), 1);
              const pct = Math.max((d.escrows / maxEscrows) * 100, 2);
              return (
                <div
                  key={d.day}
                  className="flex-1 rounded-t bg-gradient-to-t from-[var(--accent)] to-[var(--accent)]/60 transition-all hover:brightness-125"
                  style={{ height: `${pct}%` }}
                  title={`${new Date(d.day).toLocaleDateString()}: ${d.escrows} escrows, $${formatAmount(d.volume)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-[var(--text-tertiary)]">
            <span>{analytics.dailyVolume.length > 0 && new Date(analytics.dailyVolume[0].day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span>Today</span>
          </div>
        </section>
      )}

      {/* ── Top Agents ── */}
      {analytics.topAgents.length > 0 && (
        <section className="glass glow-subtle rounded-2xl p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-white">Top Agents</h2>
          <p className="text-[13px] text-[var(--text-tertiary)]">By total escrow volume</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Agent</th>
                  <th className="pb-3 pr-4 text-right">Escrows</th>
                  <th className="pb-3 pr-4 text-right">Completed</th>
                  <th className="pb-3 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-secondary)]">
                {analytics.topAgents.map((agent, i) => (
                  <tr key={agent.address} className="border-b border-[var(--border)]/50">
                    <td className="py-2.5 pr-4 text-[var(--text-tertiary)]">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <a href={`/agents/${agent.address}`} className="font-mono text-[var(--accent)] hover:underline">
                        {shortenAddress(agent.address, 6)}
                      </a>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-white">{agent.totalEscrows}</td>
                    <td className="py-2.5 pr-4 text-right text-[var(--success)]">{agent.completed}</td>
                    <td className="py-2.5 text-right font-medium text-white">${formatAmount(agent.totalVolume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
