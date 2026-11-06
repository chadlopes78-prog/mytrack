import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/errors";
import { useAuth } from "../auth/AuthProvider";
import { Button, Field, Input } from "../components/ui";
import { useToast } from "../components/Toast";
import { AuthShell } from "./AuthShell";

export function ResetPasswordPage() {
  const { session, clearRecovery } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return setError("Use pelo menos 8 caracteres com letras e números.");
    if (pw !== pw2) return setError("As palavras-passe não coincidem.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Palavra-passe actualizada.");
      clearRecovery();
      nav("/financeiro", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-bold tracking-tight">Nova palavra-passe</h1>
      {!session ? (
        <>
          <p className="mt-2 text-sm text-bone-400">Este link é inválido ou expirou. Peça um novo link de recuperação.</p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => nav("/", { replace: true })}>Voltar</Button>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Nova palavra-passe"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Confirmar"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          {error && <p role="alert" className="text-sm text-loss">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>Guardar palavra-passe</Button>
        </form>
      )}
    </AuthShell>
  );
}
