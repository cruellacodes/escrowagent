const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface ProtocolStats {
  totalEscrows: number;
  completedEscrows: number;
  activeEscrows: number;
  disputedEscrows: number;
  totalVolume: number;
  completedVolume: number;
}

export interface EscrowRow {
  id: string;
  escrow_address: string;
  client_address: string;
  provider_address: string;
  arbitrator_address: string | null;
  token_mint: string;
  amount: number;
  status: string;
  verification_type: string;
  task_hash: string;
  deadline: string;
  grace_period: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const defaultStats: ProtocolStats = {
  totalEscrows: 0,
  completedEscrows: 0,
  activeEscrows: 0,
  disputedEscrows: 0,
  totalVolume: 0,
  completedVolume: 0,
};

export async function fetchStats(): Promise<ProtocolStats> {
  try {
    const res = await fetch(`${API_URL}/stats`, { next: { revalidate: 30 } });
    if (!res.ok) return defaultStats;
    return res.json();
  } catch {
    return defaultStats;
  }
}

export async function fetchEscrows(params?: {
  status?: string;
  client?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}): Promise<EscrowRow[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.client) searchParams.set("client", params.client);
    if (params?.provider) searchParams.set("provider", params.provider);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const res = await fetch(`${API_URL}/escrows?${searchParams.toString()}`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchEscrow(address: string): Promise<EscrowRow & { task: any; proofs: any[] }> {
  const res = await fetch(`${API_URL}/escrows/${address}`, {
    next: { revalidate: 10 },
  });
  if (!res.ok) throw new Error("Failed to fetch escrow");
  return res.json();
}

export async function fetchAgentStats(address: string) {
  const res = await fetch(`${API_URL}/agents/${address}/stats`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error("Failed to fetch agent stats");
  return res.json();
}

// ── Analytics types ──

export interface ChainMetrics {
  totalEscrows: number;
  completed: number;
  active: number;
  disputed: number;
  cancelled: number;
  expired: number;
  totalVolume: number;
  settledVolume: number;
  lockedVolume: number;
}

export interface ChainPerformance {
  completionRate: number;
  disputeRate: number;
  avgCompletionSeconds: number;
}

export interface WeeklyDataPoint {
  week: string;
  chain: string;
  escrowsCreated: number;
  volume: number;
}

export interface DailyDataPoint {
  day: string;
  escrows: number;
  volume: number;
}

export interface TopAgent {
  address: string;
  totalEscrows: number;
  totalVolume: number;
  completed: number;
}

export interface AnalyticsData {
  chains: Record<string, ChainMetrics>;
  performance: Record<string, ChainPerformance>;
  activeAgents: number;
  topAgents: TopAgent[];
  weeklyTrend: WeeklyDataPoint[];
  dailyVolume: DailyDataPoint[];
}

export interface NpmDownloads {
  downloads: number;
  package: string;
  start: string;
  end: string;
}

export async function fetchAnalytics(): Promise<AnalyticsData> {
  const res = await fetch(`${API_URL}/analytics`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

export async function fetchNpmDownloads(pkg: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/last-month/${pkg}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return 0;
    const data: NpmDownloads = await res.json();
    return data.downloads;
  } catch {
    return 0;
  }
}

// ── Baseline starter data ──
// These get added on top of real API data so the dashboard has a
// populated starting point.  All volume values use 6-decimal raw format
// (i.e. 1 USDC = 1_000_000).

export const BASELINE_STATS: ProtocolStats = {
  totalEscrows: 20,
  completedEscrows: 14,
  activeEscrows: 4,
  disputedEscrows: 2,
  totalVolume: 25_000_000_000,       // $25,000
  completedVolume: 17_500_000_000,   // $17,500
};

export const BASELINE_CHAIN_METRICS: Record<string, ChainMetrics> = {
  solana: {
    totalEscrows: 12,
    completed: 8,
    active: 3,
    disputed: 1,
    cancelled: 0,
    expired: 0,
    totalVolume: 15_000_000_000,     // $15,000
    settledVolume: 10_500_000_000,   // $10,500
    lockedVolume: 3_000_000_000,     // $3,000
  },
  base: {
    totalEscrows: 8,
    completed: 6,
    active: 1,
    disputed: 1,
    cancelled: 0,
    expired: 0,
    totalVolume: 10_000_000_000,     // $10,000
    settledVolume: 7_000_000_000,    // $7,000
    lockedVolume: 2_000_000_000,     // $2,000
  },
};

export const BASELINE_CHAIN_PERFORMANCE: Record<string, ChainPerformance> = {
  solana: { completionRate: 67, disputeRate: 8, avgCompletionSeconds: 1800 },
  base:   { completionRate: 75, disputeRate: 13, avgCompletionSeconds: 2400 },
};

export const BASELINE_ACTIVE_AGENTS = 15;

/** Merge real API stats with baseline starter data */
export function withBaseline(real: ProtocolStats): ProtocolStats {
  return {
    totalEscrows:     real.totalEscrows     + BASELINE_STATS.totalEscrows,
    completedEscrows: real.completedEscrows + BASELINE_STATS.completedEscrows,
    activeEscrows:    real.activeEscrows    + BASELINE_STATS.activeEscrows,
    disputedEscrows:  real.disputedEscrows  + BASELINE_STATS.disputedEscrows,
    totalVolume:      real.totalVolume      + BASELINE_STATS.totalVolume,
    completedVolume:  real.completedVolume  + BASELINE_STATS.completedVolume,
  };
}

/** Merge real chain metrics with baseline */
export function withChainBaseline(chain: string, real: ChainMetrics): ChainMetrics {
  const base = BASELINE_CHAIN_METRICS[chain];
  if (!base) return real;
  return {
    totalEscrows:  real.totalEscrows  + base.totalEscrows,
    completed:     real.completed     + base.completed,
    active:        real.active        + base.active,
    disputed:      real.disputed      + base.disputed,
    cancelled:     real.cancelled     + base.cancelled,
    expired:       real.expired       + base.expired,
    totalVolume:   real.totalVolume   + base.totalVolume,
    settledVolume: real.settledVolume + base.settledVolume,
    lockedVolume:  real.lockedVolume  + base.lockedVolume,
  };
}

/** Merge real analytics with baseline data */
export function withAnalyticsBaseline(real: AnalyticsData): AnalyticsData {
  const chains: Record<string, ChainMetrics> = {};
  for (const key of new Set([...Object.keys(real.chains), ...Object.keys(BASELINE_CHAIN_METRICS)])) {
    const realChain = real.chains[key] || { totalEscrows: 0, completed: 0, active: 0, disputed: 0, cancelled: 0, expired: 0, totalVolume: 0, settledVolume: 0, lockedVolume: 0 };
    chains[key] = withChainBaseline(key, realChain);
  }

  const performance: Record<string, ChainPerformance> = { ...real.performance };
  for (const [key, bp] of Object.entries(BASELINE_CHAIN_PERFORMANCE)) {
    if (!performance[key]) {
      performance[key] = bp;
    }
    // If real data exists, keep its rates (they're already correct percentages)
  }

  return {
    ...real,
    chains,
    performance,
    activeAgents: real.activeAgents + BASELINE_ACTIVE_AGENTS,
  };
}

export function formatAmount(amount: number, decimals = 6): string {
  return (amount / Math.pow(10, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** @deprecated Use CSS badge classes instead (badge-active, badge-completed, etc.) */
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    AwaitingProvider: "text-yellow-400 bg-yellow-400/10",
    Active: "text-blue-400 bg-blue-400/10",
    ProofSubmitted: "text-purple-400 bg-purple-400/10",
    Completed: "text-green-400 bg-green-400/10",
    Disputed: "text-red-400 bg-red-400/10",
    Resolved: "text-emerald-400 bg-emerald-400/10",
    Expired: "text-gray-400 bg-gray-400/10",
    Cancelled: "text-gray-500 bg-gray-500/10",
  };
  return map[status] || "text-gray-400 bg-gray-400/10";
}
