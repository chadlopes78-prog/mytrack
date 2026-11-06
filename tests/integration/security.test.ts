// Testes de integração contra um Supabase real (local: `supabase start` +
// `supabase functions serve --env-file supabase/functions/.env`).
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_EMAIL, MAILPIT_URL, PASSWORD, adminClient, anonClient, approvedUser, createConfirmedUser,
  setStatus, signIn, sql, uniq, vault,
} from "./helpers";

type U = Awaited<ReturnType<typeof approvedUser>>;

describe("registo, aprovação e login", () => {
  it("novo registo fica pendente e não acede a dados privados", async () => {
    const email = `novo.${uniq()}@test.baron`;
    const c = anonClient();
    const { data, error } = await c.auth.signUp({ email, password: PASSWORD });
    expect(error).toBeNull();
    // Confirmação de e-mail obrigatória -> sem sessão até confirmar.
    expect(data.session).toBeNull();
    const [p] = await sql<{ status: string }>("select status from public.profiles where email = $1", [email]);
    expect(p.status).toBe("pending");

    // Confirma o e-mail via link real enviado (Mailpit) e entra.
    const msgs = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    expect(msgs.messages.length).toBeGreaterThan(0);
    const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${msgs.messages[0].ID}`)).json();
    const link = /href="([^"]*verify[^"]*)"/.exec(msg.HTML)?.[1]?.replace(/&amp;/g, "&");
    expect(link).toBeTruthy();
    await fetch(link!, { redirect: "manual" });

    const user = await signIn(email);
    const { data: prof } = await user.from("profiles").select("status").single();
    expect(prof!.status).toBe("pending");
    const ins = await user.from("investments").insert({ usdt_amount: 10, rate: 75, client_request_id: randomUUID() });
    expect(ins.error).not.toBeNull();
    const { data: rows } = await user.from("investments").select("*");
    expect(rows).toEqual([]);
  });

  it("palavra-passe errada é recusada e logout termina a sessão", async () => {
    const email = `login.${uniq()}@test.baron`;
    await createConfirmedUser(email);
    const bad = await anonClient().auth.signInWithPassword({ email, password: "errada-123" });
    expect(bad.error).not.toBeNull();
    const c = await signIn(email);
    expect((await c.auth.getSession()).data.session).not.toBeNull();
    await c.auth.signOut();
    expect((await c.auth.getSession()).data.session).toBeNull();
  });

  it("recuperação de palavra-passe envia e-mail", async () => {
    const email = `reset.${uniq()}@test.baron`;
    await createConfirmedUser(email);
    const { error } = await anonClient().auth.resetPasswordForEmail(email, { redirectTo: "http://127.0.0.1:5173/redefinir" });
    expect(error).toBeNull();
    await new Promise((r) => setTimeout(r, 500));
    const msgs = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    expect(msgs.messages.length).toBeGreaterThan(0);
  });
});

describe("administração", () => {
  let admin: SupabaseClient;
  beforeAll(async () => { admin = await adminClient(); });

  it("administrador principal é aprovado e tem permissões automaticamente", async () => {
    const { data } = await admin.rpc("is_admin");
    expect(data).toBe(true);
    const [row] = await sql<{ status: string; is_primary: boolean }>(
      "select p.status, ap.is_primary from public.profiles p join public.admin_permissions ap on ap.user_id = p.id where p.email = $1",
      [ADMIN_EMAIL]);
    expect(row).toEqual({ status: "approved", is_primary: true });
  });

  it("admin aprova, rejeita, suspende, reactiva e remove utilizadores", async () => {
    const email = `fluxo.${uniq()}@test.baron`;
    const u = await createConfirmedUser(email);
    const list = await admin.rpc("admin_list_users", { search: email });
    expect(list.data).toHaveLength(1);
    expect(list.data![0].status).toBe("pending");

    expect((await admin.rpc("admin_set_status", { target: u.id, new_status: "approved" })).error).toBeNull();
    const client = await signIn(email);
    const ok = await client.from("investments").insert({ usdt_amount: 20, rate: 75, client_request_id: randomUUID() }).select().single();
    expect(ok.error).toBeNull();
    expect(Number(ok.data!.mzn_amount)).toBe(1500);

    // Suspensão: perde acesso imediatamente, mesmo com a sessão já aberta.
    await admin.rpc("admin_set_status", { target: u.id, new_status: "suspended" });
    expect((await client.from("investments").select("*")).data).toEqual([]);
    expect((await client.from("investments").insert({ usdt_amount: 1, rate: 75, client_request_id: randomUUID() })).error).not.toBeNull();

    await admin.rpc("admin_set_status", { target: u.id, new_status: "approved" });
    expect((await client.from("investments").select("*")).data).toHaveLength(1);

    await admin.rpc("admin_set_status", { target: u.id, new_status: "rejected" });
    expect((await client.from("investments").select("*")).data).toEqual([]);

    expect((await admin.rpc("admin_delete_user", { target: u.id })).error).toBeNull();
    expect(await sql("select 1 from auth.users where id = $1", [u.id])).toHaveLength(0);
    expect(await sql("select 1 from public.investments where user_id = $1", [u.id])).toHaveLength(0);
  });

  it("utilizador comum não consegue usar funções administrativas", async () => {
    const a = await approvedUser("comum");
    const victim = await createConfirmedUser(`vitima.${uniq()}@test.baron`);
    expect((await a.client.rpc("is_admin")).data).toBe(false);
    expect((await a.client.rpc("admin_list_users", {})).error?.message).toMatch(/forbidden/);
    expect((await a.client.rpc("admin_set_status", { target: victim.id, new_status: "approved" })).error).not.toBeNull();
    expect((await a.client.rpc("admin_delete_user", { target: victim.id })).error).not.toBeNull();
    // Não vê perfis de outros nem consegue promover-se.
    expect((await a.client.from("profiles").select("*")).data).toHaveLength(1);
    expect((await a.client.from("profiles").update({ status: "approved" }).eq("id", victim.id)).error).not.toBeNull();
    expect((await a.client.from("admin_permissions").insert({ user_id: a.user.id })).error).not.toBeNull();
    const [v] = await sql<{ status: string }>("select status from public.profiles where id = $1", [victim.id]);
    expect(v.status).toBe("pending");
  });

  it("administrador principal não pode ser suspenso ou removido", async () => {
    const [{ id }] = await sql<{ id: string }>("select id from auth.users where email = $1", [ADMIN_EMAIL]);
    expect((await admin.rpc("admin_set_status", { target: id, new_status: "suspended" })).error).not.toBeNull();
    expect((await admin.rpc("admin_delete_user", { target: id })).error).not.toBeNull();
    // Mesmo um segundo administrador não consegue.
    const second = await approvedUser("admin2");
    await sql("insert into public.admin_permissions (user_id) values ($1)", [second.user.id]);
    expect((await second.client.rpc("admin_set_status", { target: id, new_status: "suspended" })).error).not.toBeNull();
    expect((await second.client.rpc("admin_delete_user", { target: id })).error).not.toBeNull();
    await expect(sql("update public.profiles set status = 'suspended' where id = $1", [id])).rejects.toThrow();
    await sql("delete from public.admin_permissions where user_id = $1", [second.user.id]);
  });

  it("e-mail de admin não confirmado não tem privilégios", async () => {
    // Garante que um registo não confirmado com o e-mail do admin não obtém poderes.
    const [{ id }] = await sql<{ id: string }>("select id from auth.users where email = $1", [ADMIN_EMAIL]);
    await sql("update auth.users set email_confirmed_at = null where id = $1", [id]);
    try {
      expect((await sql<{ r: boolean }>("select public.is_admin($1) as r", [id]))[0].r).toBe(false);
    } finally {
      await sql("update auth.users set email_confirmed_at = now() where id = $1", [id]);
    }
  });

  it("administrador não vê dados financeiros nem credenciais de utilizadores", async () => {
    const u = await approvedUser("privado");
    await u.client.from("investments").insert({ usdt_amount: 5, rate: 75, client_request_id: randomUUID() });
    await vault(u.client, { action: "create", request_id: randomUUID(), label: "FB", login: "x@y.z", password: "segredo-123" });
    expect((await admin.from("investments").select("*").eq("user_id", u.user.id)).data).toEqual([]);
    expect((await admin.from("facebook_accounts").select("*").eq("user_id", u.user.id)).data).toEqual([]);
  });
});

describe("cenário A / B — isolamento total entre utilizadores", () => {
  let A: U; let B: U;
  const ids: Record<string, string[]> = { A: [], B: [] };

  beforeAll(async () => {
    A = await approvedUser("utilizadorA");
    B = await approvedUser("utilizadorB");

    for (const amount of [60, 40]) {
      const r = await A.client.from("investments").insert({ usdt_amount: amount, rate: 75, client_request_id: randomUUID() }).select().single();
      expect(r.error).toBeNull();
    }
    const rb = await B.client.from("investments").insert({ usdt_amount: 50, rate: 75, client_request_id: randomUUID() }).select().single();
    expect(rb.error).toBeNull();

    await A.client.from("daily_reports").insert([
      { report_date: "2026-11-01", ad_spend: 40, spend_currency: "USDT", rate: 75, revenue_mzn: 8500, other_expenses_mzn: 500, client_request_id: randomUUID() },
      { report_date: "2026-11-02", ad_spend: 20, spend_currency: "USD", rate: 75, revenue_mzn: 1000, other_expenses_mzn: 0, client_request_id: randomUUID() },
    ]);
    await B.client.from("daily_reports").insert(
      { report_date: "2026-11-01", ad_spend: 0, spend_currency: "USDT", rate: 75, revenue_mzn: 300, other_expenses_mzn: 0, client_request_id: randomUUID() });

    for (const label of ["A Principal", "A Secundária"]) {
      const r = await vault(A.client, { action: "create", request_id: randomUUID(), label, login: `${label}@mail.com`, password: `pw-${label}` });
      expect(r.status).toBe(201);
      ids.A.push(r.body.item.id);
    }
    const r = await vault(B.client, { action: "create", request_id: randomUUID(), label: "B Única", login: "b@mail.com", password: "pw-B" });
    expect(r.status).toBe(201);
    ids.B.push(r.body.item.id);
  });

  it("cálculos financeiros gravados correctamente na base de dados", async () => {
    const { data } = await A.client.from("daily_reports").select("*").order("report_date");
    expect(data!.map((d) => [Number(d.ad_spend_mzn), Number(d.net_profit_mzn), d.roas === null ? null : Number(d.roas)]))
      .toEqual([[3000, 5000, 2.8333], [1500, -500, 0.6667]]);
    const { data: b } = await B.client.from("daily_reports").select("roas").single();
    expect(b!.roas).toBeNull(); // gasto 0 -> ROAS N/A
  });

  it("A só vê os seus dados; B só vê os seus", async () => {
    const ia = (await A.client.from("investments").select("usdt_amount")).data!;
    const ib = (await B.client.from("investments").select("usdt_amount")).data!;
    expect(ia.reduce((s, r) => s + Number(r.usdt_amount), 0)).toBe(100);
    expect(ib.reduce((s, r) => s + Number(r.usdt_amount), 0)).toBe(50);
    expect((await A.client.from("daily_reports").select("id")).data).toHaveLength(2);
    expect((await B.client.from("daily_reports").select("id")).data).toHaveLength(1);
    const la = await vault(A.client, { action: "list" });
    const lb = await vault(B.client, { action: "list" });
    expect(la.body.items.map((i: { label: string }) => i.label).sort()).toEqual(["A Principal", "A Secundária"]);
    expect(lb.body.items.map((i: { label: string }) => i.label)).toEqual(["B Única"]);
  });

  it("A não consegue ler, alterar ou apagar dados de B via API (inclui manipulação de user_id)", async () => {
    expect((await A.client.from("investments").select("*").eq("user_id", B.user.id)).data).toEqual([]);
    expect((await A.client.from("facebook_accounts").select("*").eq("user_id", B.user.id)).data).toEqual([]);
    // Tentativa de inserir registo em nome de B
    expect((await A.client.from("investments").insert({ user_id: B.user.id, usdt_amount: 1, rate: 75, client_request_id: randomUUID() })).error).not.toBeNull();
    // Tentativa de "roubar" registo de B mudando user_id
    const upd = await A.client.from("investments").update({ usdt_amount: 999 }).eq("user_id", B.user.id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await A.client.from("daily_reports").delete().eq("user_id", B.user.id).select();
    expect(del.data ?? []).toEqual([]);
    const [{ n }] = await sql<{ n: string }>("select count(*) n from public.daily_reports where user_id = $1", [B.user.id]);
    expect(Number(n)).toBe(1);
    // Cofre: ids de B são "não encontrados" para A.
    expect((await vault(A.client, { action: "get", id: ids.B[0] })).status).toBe(404);
    expect((await vault(A.client, { action: "reveal", id: ids.B[0], account_password: PASSWORD })).status).toBe(404);
    expect((await vault(A.client, { action: "delete", id: ids.B[0] })).status).toBe(404);
    expect((await vault(A.client, { action: "update", id: ids.B[0], label: "hack" })).status).toBe(404);
  });

  it("A não consegue mudar user_id de um registo seu para B", async () => {
    const { data } = await A.client.from("investments").select("id").limit(1).single();
    const r = await A.client.from("investments").update({ user_id: B.user.id } as never).eq("id", data!.id);
    expect(r.error).not.toBeNull();
  });

  it("dados persistem após logout e novo login (outro 'dispositivo')", async () => {
    await A.client.auth.signOut();
    const again = await signIn(A.email); // nova sessão independente = outro dispositivo
    expect((await again.from("investments").select("id")).data).toHaveLength(2);
    expect((await vault(again, { action: "list" })).body.items).toHaveLength(2);
    A.client = again;
  });

  it("pedidos repetidos com o mesmo client_request_id não duplicam", async () => {
    const reqId = randomUUID();
    const row = { usdt_amount: 15, rate: 75, client_request_id: reqId };
    expect((await B.client.from("investments").insert(row)).error).toBeNull();
    const dup = await B.client.from("investments").upsert(row, { onConflict: "user_id,client_request_id", ignoreDuplicates: true });
    expect(dup.error).toBeNull();
    expect((await B.client.from("investments").select("id").eq("client_request_id", reqId)).data).toHaveLength(1);
    const vreq = randomUUID();
    await vault(B.client, { action: "create", request_id: vreq, label: "Dup", login: "d@d.d", password: "p" });
    const again = await vault(B.client, { action: "create", request_id: vreq, label: "Dup", login: "d@d.d", password: "p" });
    expect(again.body.duplicate).toBe(true);
    expect((await vault(B.client, { action: "list" })).body.items).toHaveLength(2);
    await vault(B.client, { action: "delete", id: vreq });
  });
});

describe("cofre de credenciais", () => {
  let U1: U; let id: string;
  beforeAll(async () => {
    U1 = await approvedUser("cofre");
    const r = await vault(U1.client, { action: "create", request_id: randomUUID(), label: "Facebook Principal", login: "exemplo@email.com", password: "S3gr3do!FB", notes: "BM 2" });
    expect(r.status).toBe(201);
    id = r.body.item.id;
  });

  it("guarda apenas texto cifrado na base de dados", async () => {
    const [row] = await sql<Record<string, string>>("select * from public.facebook_accounts where id = $1", [id]);
    const dump = JSON.stringify(row);
    expect(dump).not.toContain("S3gr3do!FB");
    expect(dump).not.toContain("exemplo@email.com");
    expect(dump).not.toContain("BM 2");
    expect(row.password_ciphertext).toMatch(/^v1\./);
  });

  it("lista/get não devolvem a palavra-passe", async () => {
    const g = await vault(U1.client, { action: "get", id });
    expect(g.body.item).toMatchObject({ label: "Facebook Principal", login: "exemplo@email.com", notes: "BM 2" });
    expect(JSON.stringify(g.body)).not.toContain("S3gr3do!FB");
    expect(JSON.stringify((await vault(U1.client, { action: "list" })).body)).not.toContain("S3gr3do!FB");
  });

  it("revelar exige reautenticação com a palavra-passe da conta", async () => {
    expect((await vault(U1.client, { action: "reveal", id, account_password: "errada-000" })).status).toBe(403);
    const ok = await vault(U1.client, { action: "reveal", id, account_password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.password).toBe("S3gr3do!FB");
    // A sessão original continua válida após a verificação.
    expect((await U1.client.from("profiles").select("status").single()).data!.status).toBe("approved");
  });

  it("bloqueia após 5 tentativas falhadas", async () => {
    const u = await approvedUser("bruteforce");
    const r = await vault(u.client, { action: "create", request_id: randomUUID(), label: "x", login: "x@x.x", password: "pw" });
    for (let i = 0; i < 5; i++) await vault(u.client, { action: "reveal", id: r.body.item.id, account_password: `wrong-${i}aa` });
    expect((await vault(u.client, { action: "reveal", id: r.body.item.id, account_password: PASSWORD })).status).toBe(429);
    // Utilizador não pode apagar o registo de tentativas para contornar o bloqueio.
    await u.client.from("vault_audit").delete().eq("user_id", u.user.id);
    expect((await vault(u.client, { action: "reveal", id: r.body.item.id, account_password: PASSWORD })).status).toBe(429);
  });

  it("editar e eliminar", async () => {
    const up = await vault(U1.client, { action: "update", id, label: "FB Editado", password: "Nova-Pass-1" });
    expect(up.body.item.label).toBe("FB Editado");
    expect((await vault(U1.client, { action: "reveal", id, account_password: PASSWORD })).body.password).toBe("Nova-Pass-1");
    expect((await vault(U1.client, { action: "get", id })).body.item.login).toBe("exemplo@email.com");
    expect((await vault(U1.client, { action: "delete", id })).status).toBe(200);
    expect((await vault(U1.client, { action: "get", id })).status).toBe(404);
  });

  it("ciphertext copiado para outro registo não decifra (AAD)", async () => {
    const r1 = await vault(U1.client, { action: "create", request_id: randomUUID(), label: "c1", login: "a@a.a", password: "p1" });
    const r2 = await vault(U1.client, { action: "create", request_id: randomUUID(), label: "c2", login: "b@b.b", password: "p2" });
    await sql("update public.facebook_accounts set password_ciphertext = (select password_ciphertext from public.facebook_accounts where id = $1) where id = $2",
      [r1.body.item.id, r2.body.item.id]);
    expect((await vault(U1.client, { action: "reveal", id: r2.body.item.id, account_password: PASSWORD })).status).toBe(500);
  });

  it("não é possível gravar texto simples directamente na tabela", async () => {
    const r = await U1.client.from("facebook_accounts").insert({ label: "x", login_ciphertext: "plain@mail.com", password_ciphertext: "plaintext" });
    expect(r.error).not.toBeNull();
  });

  it("pedidos sem sessão ou de contas não aprovadas são recusados", async () => {
    const res = await fetch("http://127.0.0.1:54321/functions/v1/vault", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    const s = await approvedUser("suspenso");
    await setStatus(s.user.id, "suspended");
    expect((await vault(s.client, { action: "list" })).status).toBe(403);
  });

  it("anon não lê nenhuma tabela", async () => {
    const anon = anonClient();
    for (const t of ["profiles", "investments", "daily_reports", "facebook_accounts", "user_settings", "admin_permissions", "vault_audit"]) {
      const { data } = await anon.from(t).select("*");
      expect(data ?? []).toEqual([]);
    }
  });
});
