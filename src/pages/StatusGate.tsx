import { Clock, Ban, PauseCircle, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui";
import { AuthShell } from "./AuthShell";

const COPY = {
  pending: { icon: Clock, title: "Conta pendente de aprovação", text: "O seu pedido foi registado. Assim que o administrador aprovar a sua conta, terá acesso à plataforma." },
  rejected: { icon: Ban, title: "Pedido recusado", text: "O seu pedido de acesso não foi aprovado. Contacte o administrador se considerar que se trata de um erro." },
  suspended: { icon: PauseCircle, title: "Conta suspensa", text: "O acesso a esta conta foi suspenso pelo administrador. Os seus dados permanecem guardados e privados." },
  error: { icon: WifiOff, title: "Não foi possível carregar a conta", text: "Verifique a sua ligação à internet e tente novamente." },
} as const;

export function StatusGate({ status }: { status: keyof typeof COPY }) {
  const { signOut, profile } = useAuth();
  const qc = useQueryClient();
  const c = COPY[status];
  const Icon = c.icon;
  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-gold/25 bg-gold/[0.07] text-gold"><Icon className="h-6 w-6" /></div>
        <h1 className="text-xl font-bold">{c.title}</h1>
        {profile?.email && <p className="mt-1 text-xs text-bone-500">{profile.email}</p>}
        <p className="mt-3 text-sm leading-relaxed text-bone-400">{c.text}</p>
        <div className="mt-6 flex w-full gap-3">
          <Button variant="outline" className="flex-1" onClick={() => qc.invalidateQueries({ queryKey: ["profile"] })}>Verificar novamente</Button>
          <Button variant="subtle" className="flex-1" onClick={signOut}>Sair</Button>
        </div>
      </div>
    </AuthShell>
  );
}
