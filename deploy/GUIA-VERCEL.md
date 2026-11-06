# Pôr o BARON CONTROL online (Vercel + Supabase)

O seu site: **https://mytrack-ashen.vercel.app**

O erro *"Ligação à base de dados por configurar"* aparece porque o projecto `mytrack` na Vercel ainda não tem a base de dados ligada. Siga os passos por ordem. Faz-se tudo no navegador.

---

## 1. Criar a base de dados (Supabase)

**Opção A — pela Vercel (mais fácil; cria as variáveis sozinha):**
1. Vercel → projecto **mytrack** → separador **Storage** → **Connect Database** → **Supabase** → **Create New** (plano Free).
2. Na janela seguinte, marque o projecto **mytrack** e os ambientes **Production** e **Preview**.
3. A Vercel adiciona automaticamente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. O site já está preparado para estes nomes.

**Opção B — directamente em supabase.com:**
1. Crie um projecto em https://supabase.com/dashboard (região próxima, por exemplo `eu-west`).
2. Em **Project Settings → API**, copie o **Project URL** e a chave **anon / publishable**.
   ⚠️ **Nunca** use a chave `service_role` / `secret`. Se a usar por engano, o site recusa-se a arrancar.

## 2. Criar as tabelas e a segurança

1. Supabase → **SQL Editor** → **New query**.
2. Abra o ficheiro [`deploy/database.sql`](database.sql) deste repositório, copie **todo** o conteúdo, cole e carregue em **Run**.
3. Deve aparecer *"Success. No rows returned"*.

## 3. Criar a chave do cofre (senhas das contas Facebook)

1. No computador, abra qualquer página no navegador, carregue em **F12** → separador **Console**, cole isto e prima Enter:
   ```js
   "1:" + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
   ```
2. Copie o resultado (algo como `1:Qm9x...=`) e **guarde-o num local seguro** (gestor de palavras-passe).
   ⚠️ Se perder esta chave, as senhas guardadas no cofre deixam de poder ser lidas.
3. Supabase → **Edge Functions** → **Secrets** → **Add new secret**:
   - Name: `VAULT_KEYS`
   - Value: o resultado copiado

## 4. Publicar a função do cofre

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome da função: **`vault`** (exactamente assim).
3. Apague o código de exemplo, cole **todo** o conteúdo de [`deploy/vault-function.ts`](vault-function.ts) e carregue em **Deploy**.
4. Nas definições da função, confirme que **Verify JWT** está **activo**.

## 5. Configurar o login (Supabase → Authentication)

- **Sign In / Providers → Email:** activo, com **Confirm email = ON** (obrigatório: garante que só o verdadeiro dono de `chadlopesff@gmail.com` fica administrador).
- Desactive Google e outros fornecedores.
- **URL Configuration:**
  - Site URL: `https://mytrack-ashen.vercel.app`
  - Redirect URLs: adicione `https://mytrack-ashen.vercel.app/**`
- **Recomendado:** em **Emails → SMTP Settings**, configure o seu próprio servidor de e-mail (por exemplo Resend ou Brevo). O e-mail gratuito do Supabase só envia poucas mensagens por hora.

## 6. Variáveis na Vercel (só na Opção B)

Vercel → **mytrack** → **Settings → Environment Variables**. Adicione, em Production e Preview:

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | o Project URL (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | a chave **anon / publishable** |

## 7. Publicar de novo (obrigatório)

As variáveis só entram no site durante a construção (build). Vercel → **Deployments** → no último deploy, menu **⋯** → **Redeploy**.

## 8. Primeiro acesso

1. Abra https://mytrack-ashen.vercel.app → **Criar conta** com `chadlopesff@gmail.com`.
2. Confirme o e-mail recebido.
3. Entre. A conta fica aprovada automaticamente e aparece a aba **Administração**.
4. Novos utilizadores ficam **pendentes** até os aprovar nessa aba.

---

### Problemas comuns

| Mensagem no site | Causa | Solução |
|---|---|---|
| Ligação à base de dados por configurar | Variáveis em falta, ou falta o Redeploy | Passos 1/6 e depois o 7 |
| Chave errada configurada | Foi usada a chave `service_role` | Trocar pela chave `anon` e fazer Redeploy |
| O link de confirmação abre "localhost" | Site URL errado | Passo 5 |
| Erro ao abrir Contas Facebook | Função `vault` ou segredo `VAULT_KEYS` em falta | Passos 3 e 4 |
| Login funciona mas tudo vazio / "não autorizado" | O SQL do passo 2 não foi executado | Passo 2 |
