import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { must } from "../lib/errors";
import type { Profile } from "../lib/types";

interface AuthState {
  session: Session | null;
  ready: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  profileError: unknown;
  isAdmin: boolean;
  recovery: boolean;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    const apply = (s: Session | null) => {
      const uid = s?.user.id ?? null;
      // Troca de utilizador: limpa toda a cache antes de mostrar qualquer dado.
      if (uid !== lastUser.current) {
        qc.clear();
        lastUser.current = uid;
      }
      setSession(s);
    };
    supabase.auth.getSession().then(({ data }) => { apply(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      apply(s);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id;

  // O estado da conta é verificado periodicamente: uma suspensão tem efeito
  // imediato no servidor (RLS) e é reflectida na interface.
  const profileQ = useQuery({
    queryKey: ["profile", uid],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => must(await supabase.from("profiles").select("id,email,status,created_at").eq("id", uid!).single()) as Profile,
  });
  const adminQ = useQuery({
    queryKey: ["is_admin", uid],
    enabled: !!uid && profileQ.data?.status === "approved",
    queryFn: async () => must(await supabase.rpc("is_admin")) as boolean,
  });

  const value = useMemo<AuthState>(() => ({
    session, ready,
    profile: profileQ.data ?? null,
    profileLoading: !!uid && (profileQ.isPending || (profileQ.data?.status === "approved" && adminQ.isPending)),
    profileError: profileQ.error,
    isAdmin: adminQ.data === true,
    recovery,
    clearRecovery: () => setRecovery(false),
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  }), [session, ready, uid, profileQ.data, profileQ.isPending, profileQ.error, adminQ.data, adminQ.isPending, recovery, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
