/** Balance mark: a card resting level on a stone, on a small fulcrum, echoing the hero sculpture. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="11" fill="var(--stone)" />
      <circle cx="20" cy="15.5" r="5.2" fill="var(--coral)" />
      <rect x="7.5" y="21.5" width="25" height="4" rx="2" fill="var(--mint)" />
      <path d="M15.5 30.5 a4.5 4.5 0 0 1 9 0 z" fill="var(--butter)" />
    </svg>
  );
}

export function Logo({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="display text-[1.7rem] leading-none tracking-tight text-ink">balance</span>
    </span>
  );
}
