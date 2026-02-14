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
