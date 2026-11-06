import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "gold" | "ghost" | "outline" | "danger" | "subtle";
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; loading?: boolean; size?: "sm" | "md" | "lg"; icon?: ReactNode;
}>(function Button({ variant = "gold", loading, size = "md", icon, className, children, disabled, ...rest }, ref) {
  const v: Record<Variant, string> = {
    gold: "bg-gradient-to-b from-gold-300 to-gold text-ink-950 shadow-gold hover:brightness-105 active:brightness-95",
    ghost: "text-bone-200 hover:bg-white/[0.05] hover:text-bone",
    outline: "border border-white/10 bg-ink-850 text-bone hover:border-gold/40 hover:bg-ink-800",
    danger: "bg-loss/90 text-white hover:bg-loss",
    subtle: "bg-white/[0.05] text-bone hover:bg-white/[0.08]",
  };
  const s = { sm: "h-9 px-3 text-[13px] rounded-lg gap-1.5", md: "h-11 px-4 text-sm rounded-xl gap-2", lg: "h-12 px-5 text-[15px] rounded-xl gap-2" }[size];
  return (
    <button ref={ref} disabled={disabled || loading} className={cx(
      "inline-flex select-none items-center justify-center font-semibold tracking-tight transition duration-150 disabled:cursor-not-allowed disabled:opacity-50",
      v[variant], s, className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function Field({ label, hint, error, children, right }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; right?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between">
        <span className="label">{label}</span>{right}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-medium text-loss">{error}</span>
        : hint ? <span className="mt-1.5 block text-xs text-bone-500">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: string }>(
  function Input({ suffix, className, ...rest }, ref) {
    if (!suffix) return <input ref={ref} className={cx("input", className)} {...rest} />;
    return (
      <div className="relative">
        <input ref={ref} className={cx("input pr-16", className)} {...rest} />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-semibold tracking-wider text-bone-500">{suffix}</span>
      </div>
    );
  });

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-gold", className)} aria-label="A carregar" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-white/[0.05]", className)} />;
}

/** Modal: folha inferior no telemóvel, diálogo centrado no computador. */
export function Modal({ open, onClose, title, subtitle, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => panel.current?.querySelector<HTMLElement>("input,select,textarea,button[data-autofocus]")?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 animate-fade bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={panel} className={cx("relative flex max-h-[92dvh] w-full animate-sheet flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-ink-900 shadow-lift sm:rounded-3xl",
        wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="hairline absolute inset-x-8 top-0" />
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
          <div>
            <h2 id={id} className="text-lg font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-bone-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-bone-500 transition hover:bg-white/5 hover:text-bone" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 sm:px-7">{children}</div>
        {footer && <div className="pb-safe border-t border-white/[0.06] bg-ink-900 px-5 py-4 sm:px-7">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Eliminar", onConfirm, onCancel, loading, danger = true }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; loading?: boolean; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>Cancelar</Button>
        <Button variant={danger ? "danger" : "gold"} className="flex-1" onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel}</Button>
      </div>}>
      <div className="text-sm leading-relaxed text-bone-200">{message}</div>
    </Modal>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-gold/20 bg-gold/[0.06] text-gold">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-bone-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm text-bone-200">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string;
}) {
  return (
    <div className={cx("inline-flex rounded-xl border border-white/[0.07] bg-ink-850 p-1", className)} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
            value === o.value ? "bg-ink-700 text-gold shadow-card" : "text-bone-500 hover:text-bone")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
