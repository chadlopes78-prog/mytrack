import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, MailCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/errors";
import { Button, Field, Input } from "../components/ui";
import { AuthShell } from "./AuthShell";

type Mode = "login" | "signup" | "forgot";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "signup" | "forgot">(null);

  const switchMode = (m: Mode) => { setMode(m); setError(null); setDone(null); setPassword(""); setConfirm(""); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setError("Introduza um e-mail válido.");
    if (mode !== "forgot") {
      if (password.length < 8) return setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      if (mode === "signup" && !(/[a-zA-Z]/.test(password) && /\d/.test(password))) return setError("Use letras e números na palavra-passe.");
      if (mode === "signup" && password !== confirm) return setError("As palavras-passe não coincidem.");
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setDone("signup");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/redefinir` });
        if (error) throw error;
        setDone("forgot");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-gold/25 bg-gold/[0.07] text-gold"><MailCheck className="h-6 w-6" /></div>
          <h1 className="text-xl font-bold">{done === "signup" ? "Pedido registado" : "Verifique o seu e-mail"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-bone-400">
            {done === "signup"
              ? <>Enviámos um link de confirmação para <b className="text-bone">{email}</b>. Depois de confirmar, a sua conta ficará <b className="text-gold">pendente</b> até ser aprovada pelo administrador.</>
              : <>Se existir uma conta para <b className="text-bone">{email}</b>, receberá um link para definir uma nova palavra-passe.</>}
          </p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => switchMode("login")}>Voltar ao início de sessão</Button>
        </div>
      </AuthShell>
    );
  }

  const titles = { login: ["Bem-vindo de volta", "Entre na sua conta privada."], signup: ["Criar conta", "O acesso é activado após aprovação."], forgot: ["Recuperar palavra-passe", "Enviaremos um link para o seu e-mail."] }[mode];

  return (
    <AuthShell>
      {mode !== "login" && (
        <button onClick={() => switchMode("login")} className="mb-4 -ml-1 flex items-center gap-1 text-xs font-semibold text-bone-500 hover:text-bone"><ArrowLeft className="h-3.5 w-3.5" /> Voltar</button>
      )}
      <h1 className="text-xl font-bold tracking-tight">{titles[0]}</h1>
      <p className="mt-1 text-sm text-bone-500">{titles[1]}</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="E-mail">
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@email.com" required />
        </Field>
        {mode !== "forgot" && (
          <Field label="Palavra-passe" right={mode === "login" && (
            <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-semibold text-gold/90 hover:text-gold">Esqueceu-se?</button>)}>
            <div className="relative">
              <Input type={show ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-11" required />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3.5 text-bone-500 hover:text-bone" aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        )}
        {mode === "signup" && (
          <Field label="Confirmar palavra-passe" hint="Mínimo 8 caracteres, com letras e números.">
            <Input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required />
          </Field>
        )}
        {error && <p role="alert" className="rounded-xl border border-loss/25 bg-loss-900/50 px-3.5 py-2.5 text-sm text-loss">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
        </Button>
      </form>

      {mode === "login" && (
        <div className="mt-6 border-t border-white/[0.06] pt-5 text-center text-sm text-bone-500">
          Ainda não tem acesso?{" "}
          <button onClick={() => switchMode("signup")} className="font-semibold text-gold hover:text-gold-300">Criar conta</button>
        </div>
      )}
    </AuthShell>
  );
}
