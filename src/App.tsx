import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { configError } from "./lib/supabase";
import { LoginPage } from "./pages/Login";
import { ResetPasswordPage } from "./pages/ResetPassword";
import { StatusGate } from "./pages/StatusGate";
import { FinancePage } from "./pages/finance/FinancePage";

const AccountsPage = lazy(() => import("./pages/accounts/AccountsPage"));
const AccountDetail = lazy(() => import("./pages/accounts/AccountDetail"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));

export function FullScreenLoader({ text = "A carregar a sua conta…" }: { text?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-bone-500"><Spinner className="h-6 w-6" />{text}</div>
    </div>
  );
}

export function App() {
  const { session, ready, profile, profileLoading, profileError, isAdmin, recovery } = useAuth();

  if (configError) return <div className="grid min-h-dvh place-items-center p-6 text-center text-sm text-loss">{configError}</div>;
  if (!ready) return <FullScreenLoader text="A iniciar…" />;
  if (recovery) return <ResetPasswordPage />;

  if (!session) {
    return (
      <Routes>
        <Route path="/redefinir" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // Nunca renderizar áreas privadas antes de confirmar o estado da conta.
  if (profileLoading) return <FullScreenLoader />;
  if (profileError || !profile) return <StatusGate status="error" />;
  if (profile.status !== "approved") return <StatusGate status={profile.status} />;

  return (
    <Suspense fallback={<FullScreenLoader text="A carregar…" />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/financeiro" element={<FinancePage />} />
          <Route path="/contas" element={<AccountsPage />} />
          <Route path="/contas/:id" element={<AccountDetail />} />
          <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/financeiro" replace />} />
          <Route path="*" element={<Navigate to="/financeiro" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
