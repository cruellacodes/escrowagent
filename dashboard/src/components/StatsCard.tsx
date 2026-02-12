"use client";

interface StatsCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  delay?: number;
}

export function StatsCard({
  label,
  value,
  subtext,
  icon,
  trend,
  delay = 0,
}: StatsCardProps) {
  return (
    <div
      className="glass glow-subtle group animate-fade-up rounded-2xl p-6 transition-all duration-300 hover:border-[var(--border-bright)] hover:bg-[var(--glass-hover)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
          {label}
        </p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-transform group-hover:scale-110">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-[32px] font-bold tracking-tight text-white leading-none">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-[12px] font-semibold ${
              trend.positive ? "text-[var(--success)]" : "text-[var(--danger)]"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={trend.positive ? "" : "rotate-180"}
            >
              <path
                d="M6 2.5L9.5 6.5H2.5L6 2.5Z"
                fill="currentColor"
              />
            </svg>
            {trend.value}
          </span>
        )}
        {subtext && (
          <span className="text-[12px] text-[var(--text-tertiary)]">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}
