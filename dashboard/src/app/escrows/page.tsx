import { EscrowTable } from "@/components/EscrowTable";
import type { EscrowRow } from "@/lib/api";

async function getEscrows(
  searchParams: Record<string, string>
): Promise<EscrowRow[]> {
  const params = new URLSearchParams(searchParams);
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/escrows?${params.toString()}`,
      { next: { revalidate: 10 } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const STATUS_FILTERS = [
  { key: "All", label: "All", class: "" },
  { key: "AwaitingProvider", label: "Awaiting", class: "badge-awaiting" },
  { key: "Active", label: "Active", class: "badge-active" },
  { key: "ProofSubmitted", label: "Proof", class: "badge-proof" },
  { key: "Completed", label: "Completed", class: "badge-completed" },
  { key: "Disputed", label: "Disputed", class: "badge-disputed" },
  { key: "Resolved", label: "Resolved", class: "badge-resolved" },
  { key: "Expired", label: "Expired", class: "badge-expired" },
  { key: "Cancelled", label: "Cancelled", class: "badge-cancelled" },
];

export default async function EscrowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const resolvedParams = await searchParams;
  const escrows = await getEscrows(resolvedParams);
  const currentStatus = resolvedParams.status || "All";

  return (
    <div className="space-y-8">
      <div className="animate-fade-up space-y-1">
        <h1 className="text-[28px] font-bold tracking-tight">Escrows</h1>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Browse and filter all escrows across the protocol
        </p>
      </div>

      {/* Filter pills */}
      <div className="animate-fade-up animate-delay-1 flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ key, label }) => {
          const isActive = currentStatus === key;
          return (
            <a
              key={key}
              href={key === "All" ? "/escrows" : `/escrows?status=${key}`}
              className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all ${
                isActive
                  ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20"
                  : "glass text-[var(--text-secondary)] hover:bg-[var(--glass-hover)] hover:text-white"
              }`}
            >
              {label}
            </a>
          );
        })}
      </div>

      <div className="animate-fade-up animate-delay-2">
        <EscrowTable escrows={escrows} />
      </div>
    </div>
  );
}
