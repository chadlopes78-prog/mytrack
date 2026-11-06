# BARON CONTROL

Plataforma SaaS privada para controlar investimentos em anúncios (compras de USDT), gastos publicitários, faturamento, lucro e um cofre cifrado de credenciais de contas Facebook.

**Stack:** React 18 + TypeScript + Tailwind CSS (Vite) · Supabase (PostgreSQL, Auth, Edge Functions) · Row Level Security em todas as tabelas privadas.

---

## Arquitectura

```
Navegador (React)  ──anon key + JWT──▶  Supabase REST (PostgREST)  ──▶  PostgreSQL + RLS
        │                                                                   ▲
        └──────── JWT ───────▶  Edge Function "vault" ── JWT do utilizador ─┘
                                   (AES-256-GCM, chave só nos segredos da função)
```

| Camada | Responsabilidade |
|---|---|
| `supabase/migrations/` | Esquema, tipos, triggers, RLS, permissões por coluna e funções administrativas (RPC). |
| `supabase/functions/vault/` | Único ponto que cifra/decifra credenciais. Sem dependências externas. Usa o JWT do utilizador, portanto o RLS aplica-se também aqui. |
| `src/lib/finance.ts` | Cálculos financeiros em cêntimos inteiros, com o mesmo arredondamento da base de dados. |
| `src/lib/data.ts` | Acesso a dados (React Query). Cache só em memória, com chaves por `user_id`. |

### Tabelas

| Tabela | Conteúdo |
|---|---|
| `profiles` | 1 por utilizador: e-mail, estado (`pending` / `approved` / `rejected` / `suspended`). |
| `admin_permissions` | Quem é administrador. `is_primary` marca o administrador principal. |
| `user_settings` | Taxa por defeito (75 MT) e reconciliação do saldo da conta de anúncios. |
| `investments` | Cada compra/carregamento de USDT: quantidade, taxa histórica, MT (coluna gerada), destino (carregado / em carteira). |
| `daily_reports` | Relatórios diários: gasto (USD/USDT), taxa, faturamento, outras despesas. Despesa em MT, lucro líquido e ROAS são **colunas geradas** pela base de dados. |
| `facebook_accounts` | Nome + credenciais **apenas cifradas** (um `CHECK` rejeita texto simples). |
| `vault_audit` | Registo de acessos ao cofre (sem segredos) e bloqueio após 5 reautenticações falhadas em 15 min. |

### Fórmulas (iguais no frontend e na base de dados)

- Valor em meticais = USDT × taxa
- Despesa publicitária = gasto × taxa
- Lucro líquido = faturamento − despesa publicitária − outras despesas
- ROAS = faturamento ÷ despesa publicitária (N/A se a despesa for 0)

### Comprado vs. carregado vs. gasto

O dashboard separa três valores: **USDT comprados** (todos os investimentos), **USDT carregados** na conta de anúncios (investimentos marcados "Carregado na conta") e **gasto efectivo** (soma dos relatórios). O **saldo** aparece como *Saldo estimado* (carregado − gasto) até o utilizador indicar, em *Taxa e saldo*, o saldo real verificado no Gestor de Anúncios numa data. A partir daí aparece como *Saldo disponível — reconciliado* e soma apenas os movimentos posteriores a essa data.

---

## Segurança

- **RLS** em todas as tabelas: cada utilizador só lê e escreve as suas linhas (`user_id = auth.uid()`) **e** só enquanto a conta estiver `approved`. Uma suspensão tem efeito no pedido seguinte, mesmo com a sessão aberta.
- **`user_id` não pode ser manipulado:** tem valor por defeito `auth.uid()`, o cliente não tem permissão de escrita nessa coluna e um trigger impede alterá-lo.
- **Colunas calculadas** (MT, lucro, ROAS) e de sistema não podem ser escritas pelo cliente (permissões por coluna).
- **Administração:** `is_admin()` exige uma linha em `admin_permissions`, conta aprovada **e e-mail confirmado**. Todas as acções administrativas são funções `SECURITY DEFINER` que validam isto no servidor. O administrador principal (`chadlopesff@gmail.com`) é criado automaticamente como aprovado/admin no registo, e não pode ser suspenso nem removido (protegido também por trigger).
- **O administrador não vê dados privados:** não existem políticas RLS de administrador sobre `investments`, `daily_reports` ou `facebook_accounts`.
- **Cofre:** AES-256-GCM com IV aleatório por valor. O AAD liga cada ciphertext ao utilizador, ao registo e ao campo, por isso um valor copiado para outro registo não decifra. As chaves são versionadas (`VAULT_KEYS`), o que permite rodá-las. A palavra-passe só é devolvida depois de reautenticação com a palavra-passe da conta BARON. Fica apenas em memória no navegador e é ocultada automaticamente após 30 s. Os logs nunca incluem o corpo dos pedidos.
- **Idempotência:** cada formulário gera um `client_request_id` (único por utilizador). Duplo clique ou nova tentativa após falha de rede não duplicam registos. Antes de guardar um relatório idêntico (mesmo dia e valores), o servidor é consultado e é pedida confirmação.
- **Sem armazenamento local de dados:** o navegador guarda apenas o token de sessão do Supabase. Todos os dados vêm da base de dados, e a cache em memória é limpa ao trocar de utilizador ou terminar sessão.

> **Limite honesto:** a cifra é feita no servidor. Quem tiver acesso simultâneo à base de dados **e** aos segredos da Edge Function (ou seja, o dono do projecto Supabase) poderia, tecnicamente, decifrar. Pela aplicação, o administrador não consegue.

---

## Configuração em produção (o que tem de ser feito fora do código)

1. **Criar projecto em [supabase.com](https://supabase.com)** e instalar a CLI (`npm i -g supabase` ou `npx supabase`).
2. **Ligar e aplicar o esquema:**
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
   ```bash
   npx supabase db push
   ```
3. **Gerar a chave do cofre e guardá-la como segredo** (guarde uma cópia offline: se a perder, as credenciais deixam de poder ser decifradas):
   ```bash
   npx supabase secrets set VAULT_KEYS="1:$(openssl rand -base64 32)"
   ```
   Opcional — restringir CORS ao seu domínio:
   ```bash
   npx supabase secrets set ALLOWED_ORIGINS="https://o-seu-dominio.com"
   ```
4. **Publicar a Edge Function:**
   ```bash
   npx supabase functions deploy vault
   ```
5. **Auth (Dashboard → Authentication):**
   - *Providers → Email:* activo, **Confirm email = ON** (obrigatório: é a confirmação que garante que só o dono do e-mail `chadlopesff@gmail.com` obtém privilégios de administrador).
   - Desactivar todos os outros providers (Google, etc.).
   - *URL Configuration:* `Site URL` = o domínio da app; adicionar `https://o-seu-dominio.com/**` a *Redirect URLs* (necessário para confirmação de e-mail e recuperação de palavra-passe).
   - *Password policy:* mínimo 8 caracteres, letras e dígitos.
   - *SMTP:* configurar um servidor SMTP próprio (o SMTP por defeito do Supabase tem um limite muito baixo de e-mails por hora).
6. **Frontend:** copiar `.env.example` para `.env.local` (ou para as variáveis do serviço de alojamento) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública). **Nunca** colocar a `service_role` key no frontend.
7. **Build e alojamento** (Vercel, Netlify, Cloudflare Pages…). Configurar o rewrite de SPA (todas as rotas → `index.html`).
   ```bash
   npm run build
   ```
8. **Primeiro acesso:** registar `chadlopesff@gmail.com` na página de login e confirmar o e-mail. A conta fica imediatamente aprovada e com a aba Administração.

---

## Desenvolvimento local

Requer Node 20+, Docker e a CLI do Supabase.

```bash
npm install
```
```bash
./scripts/dev-up.sh
```

O script inicia o Supabase local, as Edge Functions (gera `supabase/functions/.env` com uma chave de teste) e o Vite em http://127.0.0.1:5173. Os e-mails (confirmação/recuperação) chegam ao Mailpit em http://127.0.0.1:54324. Crie `.env.local` com os valores do `supabase start` (URL `http://127.0.0.1:54321` e `ANON_KEY`).

## Testes

```bash
npm test
```
Testes unitários: cálculos financeiros, filtros de período, consolidação diária, formatação, criptografia do cofre (AES-GCM, AAD, adulteração, rotação de chaves).

```bash
npm run test:integration
```
Testes de integração contra o Supabase real: registo pendente com confirmação de e-mail, login/logout, recuperação de palavra-passe, aprovação/rejeição/suspensão/reactivação/remoção, protecção do administrador principal, utilizador comum sem acesso a RPCs de administração, cenário A (100 USDT, 2 relatórios, 2 contas) / B (50 USDT, 1 relatório, 1 conta) com tentativas cruzadas de leitura/escrita/eliminação e manipulação de `user_id`, persistência após novo login, idempotência, cofre cifrado na base de dados, reautenticação, bloqueio por força bruta, `anon` sem acesso.

```bash
node tests/e2e/flow.mjs
```
Teste E2E em Chromium (com o ambiente local a correr): registo → confirmação → pendente → aprovação pelo admin → investimentos sucessivos (20/30/15 USDT) → cálculo (exemplo do enunciado: lucro 5.000 MT) → duplicado detectado → prejuízo e consolidação diária → edição → cofre (pesquisa, copiar, mostrar com reautenticação, ocultar) → actualizar página → logout e login noutro "dispositivo" → isolamento admin/utilizador → suspensão → layouts mobile (390 px), tablet (820 px) e desktop (1440 px). As capturas ficam em `test-results/screens/`.
