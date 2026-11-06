#!/usr/bin/env bash
# Arranca o ambiente local completo: Supabase (Docker), Edge Functions e Vite.
# Requer Docker e a CLI do Supabase (npx supabase).
set -euo pipefail
cd "$(dirname "$0")/.."
SB="${SUPABASE_CLI:-npx supabase}"
if [ ! -f supabase/functions/.env ]; then
  echo "VAULT_KEYS=1:$(openssl rand -base64 32)" > supabase/functions/.env
  echo "Criado supabase/functions/.env com uma chave de cofre local."
fi
$SB start -x studio,imgproxy,vector,logflare,supavisor,realtime,storage-api,postgres-meta
nohup $SB functions serve --env-file supabase/functions/.env > /tmp/baron-functions.log 2>&1 &
nohup npx vite > /tmp/baron-vite.log 2>&1 &
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:54321/functions/v1/vault | grep -q 401; then break; fi
  sleep 1
done
echo "Pronto: app http://127.0.0.1:5173 · e-mails http://127.0.0.1:54324"
