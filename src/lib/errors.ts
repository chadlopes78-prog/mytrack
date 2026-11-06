// Mensagens de erro claras em português. Nunca expõe detalhes internos.
const MAP: Record<string, string> = {
  "Invalid login credentials": "E-mail ou palavra-passe incorrectos.",
  "Email not confirmed": "Confirme o seu e-mail antes de entrar. Verifique a sua caixa de entrada.",
  "User already registered": "Já existe uma conta com este e-mail.",
  "Password should be at least 8 characters.": "A palavra-passe deve ter pelo menos 8 caracteres.",
  reauth_failed: "Palavra-passe incorrecta.",
  too_many_attempts: "Demasiadas tentativas falhadas. Aguarde 15 minutos e tente novamente.",
  account_not_approved: "A sua conta não está aprovada.",
  not_found: "Registo não encontrado.",
  unauthorized: "Sessão expirada. Entre novamente.",
  forbidden: "Não tem permissão para esta operação.",
  "primary admin is protected": "O administrador principal está protegido.",
  "cannot change own status": "Não pode alterar o estado da sua própria conta.",
  "cannot delete self": "Não pode remover a sua própria conta.",
  "user not found": "Utilizador não encontrado.",
  offline: "Sem ligação à internet. Nada foi guardado — tente novamente quando estiver online.",
  network: "Falha de ligação ao servidor. Nada foi confirmado — tente novamente.",
  too_long_label: "O nome é demasiado longo (máx. 80).",
  too_long_notes: "As observações são demasiado longas.",
};

export class AppError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

export function errorMessage(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return MAP.offline;
  const raw = e instanceof AppError ? e.code : e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (MAP[raw]) return MAP[raw];
  if (/password/i.test(raw) && /characters|weak|contain/i.test(raw)) return "Palavra-passe fraca: use pelo menos 8 caracteres com letras e números.";
  if (/rate limit|too many/i.test(raw)) return "Demasiados pedidos. Aguarde um momento e tente novamente.";
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(raw)) return MAP.network;
  if (/row-level security|permission denied|42501/i.test(raw)) return "Operação não autorizada.";
  return "Ocorreu um erro inesperado. Tente novamente.";
}

/** Lança se estiver offline — evita confirmações falsas de sucesso. */
export function assertOnline() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new AppError("offline");
}

/** Converte a resposta do supabase-js em excepção. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new AppError(res.error.message);
  return res.data;
}
