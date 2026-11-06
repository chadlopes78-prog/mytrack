import { NavLink, Outlet } from "react-router-dom";
import { KeyRound, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Wordmark, Mark } from "./Logo";
import { cx } from "./ui";

export function Layout() {
  const { isAdmin, profile, signOut } = useAuth();
  // A aba Administração só aparece para administradores (e o servidor valida cada acção).
  const tabs = [
    { to: "/financeiro", label: "Financeiro", icon: Wallet },
    { to: "/contas", label: "Contas Facebook", short: "Contas", icon: KeyRound },
    ...(isAdmin ? [{ to: "/admin", label: "Administração", short: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Sidebar — computador */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-white/[0.05] bg-ink-950/80 px-5 py-7 backdrop-blur-xl lg:flex">
        <div className="px-2"><Wordmark /></div>
        <div className="hairline my-7 opacity-60" />
        <nav className="flex flex-col gap-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              isActive ? "bg-white/[0.045] text-bone" : "text-bone-500 hover:bg-white/[0.03] hover:text-bone-200")}>
              {({ isActive }) => (<>
                <span className={cx("absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-gold transition", isActive ? "opacity-100" : "opacity-0")} />
                <Icon className={cx("h-[18px] w-[18px]", isActive ? "text-gold" : "")} strokeWidth={1.8} />
                {label}
              </>)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/[0.06] bg-ink-900 p-3">
          <div className="truncate px-1 text-[13px] font-semibold" title={profile?.email}>{profile?.email}</div>
          <div className="px-1 text-[11px] text-bone-500">{isAdmin ? "Administrador" : "Conta privada"}</div>
          <button onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.06] py-2 text-[13px] font-semibold text-bone-400 transition hover:border-loss/40 hover:text-loss">
            <LogOut className="h-4 w-4" /> Terminar sessão
          </button>
        </div>
      </aside>

      {/* Barra superior — telemóvel/tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.05] bg-ink-950/85 px-4 py-3 backdrop-blur-xl lg:hidden"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        <div className="flex items-center gap-2.5">
          <Mark className="h-8 w-8" />
          <span className="text-[13px] font-extrabold tracking-[0.22em]">BARON <span className="text-gold">CONTROL</span></span>
        </div>
        <button onClick={signOut} className="rounded-lg p-2 text-bone-500 transition hover:text-loss" aria-label="Terminar sessão"><LogOut className="h-5 w-5" /></button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
        <Outlet />
      </main>

      {/* Navegação inferior — telemóvel/tablet */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md">
          {tabs.map(({ to, label, short, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx(
              "relative flex flex-1 flex-col items-center gap-1 pb-2.5 pt-3 text-[11px] font-semibold transition",
              isActive ? "text-gold" : "text-bone-500")}>
              {({ isActive }) => (<>
                <span className={cx("absolute top-0 h-[2px] w-8 rounded-full bg-gold transition", isActive ? "opacity-100" : "opacity-0")} />
                <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
                {short ?? label}
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
      <div>
        <div className="label text-gold/80">{eyebrow}</div>
        <h1 className="mt-1.5 text-[26px] font-extrabold tracking-tight sm:text-3xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}
