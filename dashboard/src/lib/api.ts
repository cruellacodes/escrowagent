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

export async function fetchStats(): Promise<ProtocolStats> {
  const res = await fetch(`${API_URL}/stats`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchEscrows(params?: {
  status?: string;
  client?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}): Promise<EscrowRow[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.client) searchParams.set("client", params.client);
  if (params?.provider) searchParams.set("provider", params.provider);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const res = await fetch(`${API_URL}/escrows?${searchParams.toString()}`, {
    next: { revalidate: 10 },
  });
  if (!res.ok) throw new Error("Failed to fetch escrows");
  return res.json();
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
