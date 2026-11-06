import { useId } from "react";

export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  const gid = `bg-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E8CD8B" /><stop offset="1" stopColor="#B8913A" /></linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="#121214" stroke="rgba(217,180,90,.35)" />
      <path d="M13 9.5h9.2c4.6 0 7.1 2.3 7.1 5.8 0 2.3-1.2 4-3.4 4.7 2.9.6 4.6 2.6 4.6 5.4 0 4-3 6.6-7.8 6.6H13V9.5zm5 4.3v5h3c1.7 0 2.8-1 2.8-2.5s-1.1-2.5-2.8-2.5h-3zm0 9v5.4h3.6c1.8 0 3-1 3-2.7s-1.2-2.7-3-2.7H18z" fill={`url(#${gid})`} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <Mark />
      <div className="leading-none">
        <div className="text-[15px] font-extrabold tracking-[0.22em]">BARON</div>
        <div className="mt-1 text-[10px] font-semibold tracking-[0.42em] text-gold">CONTROL</div>
      </div>
    </div>
  );
}
