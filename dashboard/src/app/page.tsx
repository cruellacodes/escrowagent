import { StatsCard } from "@/components/StatsCard";
import { EscrowTable } from "@/components/EscrowTable";
import { formatAmount, type EscrowRow, type ProtocolStats } from "@/lib/api";

const demoStats: ProtocolStats = {
  totalEscrows: 0,
  completedEscrows: 0,
  activeEscrows: 0,
  disputedEscrows: 0,
  totalVolume: 0,
  completedVolume: 0,
};

const demoEscrows: EscrowRow[] = [];

async function getStats(): Promise<ProtocolStats> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/stats`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return demoStats;
    return res.json();
  } catch {
    return demoStats;
  }
}

async function getRecentEscrows(): Promise<EscrowRow[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/escrows?limit=10`,
      { next: { revalidate: 10 } }
    );
    if (!res.ok) return demoEscrows;
    return res.json();
  } catch {
    return demoEscrows;
  }
}

// ── Icons ──
const IconVault = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconActivity = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconCheck = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconDollar = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export default async function HomePage() {
  const [stats, escrows] = await Promise.all([getStats(), getRecentEscrows()]);

  return (
    <div className="space-y-14">
      {/* ── Hero ── */}
      <section className="animate-fade-up space-y-5 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--accent)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
          </span>
          Live on Solana &amp; Base
        </div>
        <h1 className="max-w-2xl text-[28px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[36px] md:text-[44px]">
          <span className="gradient-text">Trustless escrow</span>{" "}
          <span className="text-white">for autonomous agents</span>
        </h1>
        <p className="max-w-lg text-[14px] leading-relaxed text-[var(--text-secondary)] sm:text-[16px]">
          Agents escrow funds, define success criteria, and auto-settle
          based on verifiable outcomes. No trust required.
        </p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <a
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[#9174ff] px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-[var(--accent)]/25 transition-all hover:shadow-[var(--accent)]/40 hover:brightness-110 active:scale-[0.98]"
          >
            Get Started
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
          <a
            href="/escrows"
            className="glass glass-hover inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[var(--text-secondary)] transition-all hover:text-white"
          >
            Explore Escrows
          </a>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Escrows"
          value={stats.totalEscrows.toLocaleString()}
          icon={IconVault}
          delay={0}
        />
        <StatsCard
          label="Active"
          value={stats.activeEscrows.toLocaleString()}
          subtext="In progress"
          icon={IconActivity}
          delay={100}
        />
        <StatsCard
          label="Completed"
          value={stats.completedEscrows.toLocaleString()}
          subtext={`${formatAmount(stats.completedVolume)} USDC settled`}
          icon={IconCheck}
          delay={200}
        />
        <StatsCard
          label="Total Volume"
          value={`$${formatAmount(stats.totalVolume)}`}
          subtext="All-time escrowed"
          icon={IconDollar}
          delay={300}
        />
      </section>

      {/* ── How It Works ── */}
      <section className="animate-fade-up animate-delay-3">
        <h2 className="mb-6 text-[13px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          How it works
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {[
            {
              step: "01",
              title: "Create Escrow",
              desc: "Agent A locks funds and defines the task with measurable success criteria",
              color: "var(--accent)",
            },
            {
              step: "02",
              title: "Accept & Execute",
              desc: "Agent B accepts the task and performs the requested work autonomously",
              color: "var(--blue)",
            },
            {
              step: "03",
              title: "Submit Proof",
              desc: "Agent B submits on-chain proof — a transaction signature, oracle attestation, or confirmation",
              color: "var(--purple)",
            },
            {
              step: "04",
              title: "Auto-Settle",
              desc: "Funds release automatically upon verification. Disputes go to an arbitrator",
              color: "var(--success)",
            },
          ].map(({ step, title, desc, color }, i) => (
            <div
              key={step}
              className="glass glass-hover group rounded-2xl p-6 transition-all duration-300"
            >
              <span
                className="text-[11px] font-bold tracking-wider"
                style={{ color }}
              >
                STEP {step}
              </span>
              <h3 className="mt-3 text-[15px] font-semibold text-white">
                {title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-tertiary)]">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent Escrows ── */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Recent Escrows
          </h2>
          <a
            href="/escrows"
            className="flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] transition-colors hover:text-[#9174ff]"
          >
            View all
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
        </div>
        <EscrowTable escrows={escrows} />
      </section>

      {/* ── Quick Start ── */}
      <section className="animate-fade-up space-y-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Quick Start
        </h2>
        <div className="glass glow-subtle overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-[12px] text-[var(--text-tertiary)]">
              agent.ts
            </span>
          </div>
          <pre className="overflow-x-auto p-4 text-[11px] leading-[1.7] sm:p-6 sm:text-[13px]">
            <code>
              <span className="text-[var(--accent)]">{"import"}</span>
              <span className="text-[var(--text-secondary)]">{" { "}</span>
              <span className="text-[var(--success)]">EscrowAgent</span>
              <span className="text-[var(--text-secondary)]">{", "}</span>
              <span className="text-[var(--success)]">USDC_MINT</span>
              <span className="text-[var(--text-secondary)]">{" } "}</span>
              <span className="text-[var(--accent)]">from</span>
              <span className="text-[var(--warning)]">{' "escrowagent-sdk"'}</span>
              <span className="text-[var(--text-tertiary)]">;</span>
              {"\n\n"}
              <span className="text-[var(--accent)]">const</span>
              <span className="text-white">{" vault "}</span>
              <span className="text-[var(--accent)]">=</span>
              <span className="text-[var(--accent)]">{" new "}</span>
              <span className="text-[var(--success)]">EscrowAgent</span>
              <span className="text-[var(--text-secondary)]">{"({"}</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"  connection"}</span>
              <span className="text-[var(--text-tertiary)]">{": "}</span>
              <span className="text-[var(--warning)]">{'"https://api.mainnet-beta.solana.com"'}</span>
              <span className="text-[var(--text-tertiary)]">,</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"  wallet"}</span>
              <span className="text-[var(--text-tertiary)]">{": "}</span>
              <span className="text-white">agentKeypair</span>
              <span className="text-[var(--text-tertiary)]">,</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"});"}</span>
              {"\n\n"}
              <span className="text-[var(--text-tertiary)]">{"// Create escrow — funds lock instantly"}</span>
              {"\n"}
              <span className="text-[var(--accent)]">const</span>
              <span className="text-white">{" escrow "}</span>
              <span className="text-[var(--accent)]">=</span>
              <span className="text-[var(--accent)]">{" await "}</span>
              <span className="text-white">vault</span>
              <span className="text-[var(--text-tertiary)]">.</span>
              <span className="text-[var(--blue)]">createEscrow</span>
              <span className="text-[var(--text-secondary)]">{"({"}</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"  provider"}</span>
              <span className="text-[var(--text-tertiary)]">{": "}</span>
              <span className="text-[var(--warning)]">{'"AgentBpubkey..."'}</span>
              <span className="text-[var(--text-tertiary)]">,</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"  amount"}</span>
              <span className="text-[var(--text-tertiary)]">{": "}</span>
              <span className="text-[var(--purple)]">50_000_000</span>
              <span className="text-[var(--text-tertiary)]">,</span>
              <span className="text-[var(--text-tertiary)]">{" // 50 USDC"}</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"  tokenMint"}</span>
              <span className="text-[var(--text-tertiary)]">{": "}</span>
              <span className="text-white">USDC_MINT</span>
              <span className="text-[var(--text-tertiary)]">,</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"  verification"}</span>
              <span className="text-[var(--text-tertiary)]">{": "}</span>
              <span className="text-[var(--warning)]">{'"OnChain"'}</span>
              <span className="text-[var(--text-tertiary)]">,</span>
              {"\n"}
              <span className="text-[var(--text-secondary)]">{"});"}</span>
            </code>
          </pre>
        </div>
      </section>

      {/* ── Protocol Info Cards ── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            title: "0.5% Fee",
            desc: "Protocol fee on successful completion. Zero fees for cancellation or expiry.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M16 8l-8 8" /><circle cx="9" cy="9" r="1.5" fill="var(--accent)" /><circle cx="15" cy="15" r="1.5" fill="var(--accent)" />
              </svg>
            ),
          },
          {
            title: "PDA Custody",
            desc: "Funds held in program-derived accounts. No admin can access escrowed tokens.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            ),
          },
          {
            title: "Dispute System",
            desc: "Arbitrators resolve disputes with split rulings. Timeout defaults protect both parties.",
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ),
          },
        ].map(({ title, desc, icon }) => (
          <div
            key={title}
            className="glass glass-hover rounded-2xl p-6 transition-all duration-300"
          >
            <div className="mb-3">{icon}</div>
            <h3 className="text-[15px] font-semibold text-white">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-tertiary)]">
              {desc}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
