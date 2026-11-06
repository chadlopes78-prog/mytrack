// Gera deploy/vault-function.ts: a Edge Function "vault" num único ficheiro,
// para colar no editor do painel do Supabase (Edge Functions → Deploy a new function → Via Editor).
// Uso: node scripts/build-vault-single.mjs   (o teste unitário falha se estiver desactualizado)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function buildVaultSingle(root = fileURLToPath(new URL("..", import.meta.url))) {
  const crypto = readFileSync(`${root}/supabase/functions/_shared/crypto.ts`, "utf8");
  const index = readFileSync(`${root}/supabase/functions/vault/index.ts`, "utf8")
    .replace(/^import \{[^}]*\} from "\.\.\/_shared\/crypto\.ts";\n/m, "");
  return `// ============================================================================
// BARON CONTROL — Edge Function "vault" (ficheiro único, GERADO — não editar)
// Origem: supabase/functions/vault/index.ts + supabase/functions/_shared/crypto.ts
// Regenerar: node scripts/build-vault-single.mjs
// Requer o segredo VAULT_KEYS nas Edge Function Secrets do Supabase.
// ============================================================================

${crypto}
// ---------------------------------------------------------------------------

${index}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  writeFileSync(`${root}/deploy/vault-function.ts`, buildVaultSingle(root));
  console.log("deploy/vault-function.ts actualizado");
}
