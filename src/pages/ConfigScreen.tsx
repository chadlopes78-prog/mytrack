import { Settings2, ShieldAlert } from "lucide-react";
import type { ConfigProblem } from "../lib/supabase";
import { AuthShell } from "./AuthShell";

const COPY: Record<Exclude<ConfigProblem, null>, { title: string; text: string }> = {
  missing: {
    title: "Ligação à base de dados por configurar",
    text: "Este site foi publicado sem o endereço e a chave pública do Supabase. O administrador deve definir as variáveis de ambiente no alojamento e publicar novamente.",
  },
  secret_key: {
    title: "Chave errada configurada",
    text: "Foi configurada a chave SECRETA (service_role) do Supabase. Por segurança o site não arranca. Substitua-a pela chave pública (anon / publishable) e publique novamente.",
  },
  bad_url: {
    title: "Endereço do Supabase inválido",
    text: "O endereço deve ter o formato https://<projecto>.supabase.co. Corrija a variável e publique novamente.",
  },
};

export function ConfigScreen({ problem }: { problem: Exclude<ConfigProblem, null> }) {
  const c = COPY[problem];
  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-gold/25 bg-gold/[0.07] text-gold">
          {problem === "secret_key" ? <ShieldAlert className="h-6 w-6" /> : <Settings2 className="h-6 w-6" />}
        </div>
        <h1 className="text-xl font-bold">{c.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-bone-400">{c.text}</p>
        <div className="mt-5 w-full rounded-xl border border-white/[0.07] bg-ink-850 p-4 text-left text-xs leading-relaxed text-bone-400">
          <div className="label mb-2">Variáveis necessárias</div>
          <code className="block break-all text-bone-200">VITE_SUPABASE_URL</code>
          <code className="block break-all text-bone-200">VITE_SUPABASE_ANON_KEY</code>
          <p className="mt-2 text-bone-500">Também são aceites NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (criadas pela integração Supabase da Vercel). Depois de as definir é obrigatório fazer novo deploy.</p>
        </div>
      </div>
    </AuthShell>
  );
}
