import type { ReactNode } from "react";
import { Wordmark } from "../components/Logo";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "56px 56px", maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
      }} />
      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="mb-8 flex justify-center"><Wordmark /></div>
        <div className="card relative overflow-hidden p-6 sm:p-8">
          <div className="hairline absolute inset-x-10 top-0" />
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-bone-600">Plataforma privada · Acesso apenas por aprovação</p>
      </div>
    </div>
  );
}
