// Teste E2E no navegador real (Chromium) contra o Supabase local.
// Uso: node tests/e2e/flow.mjs  (requer `supabase start`, functions serve e `npm run dev`)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://127.0.0.1:5173";
const MAILPIT = "http://127.0.0.1:54324";
const ADMIN = { email: "chadlopesff@gmail.com", password: "Baron-Test-2026" };
const SHOTS = process.env.SHOTS_DIR ?? "test-results/screens";
mkdirSync(SHOTS, { recursive: true });
const user = { email: `e2e.${Date.now()}@test.baron`, password: "Utilizador-2026" };
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); console.log("PASS", name); }
  catch (e) {
    for (const [ci, c] of browser.contexts().entries()) for (const [pi, pg] of c.pages().entries()) {
      await pg.screenshot({ path: `${SHOTS}/FAIL-${ci}-${pi}.png` }).catch(() => {});
      if (process.env.DEBUG_E2E) console.log("   page", ci, pi, (await pg.locator("body").innerText().catch(() => "")).slice(0, 400).replace(/\n/g, " | "));
    }
    results.push(["FAIL", name]); console.log("FAIL", name, "\n ", e.message.split("\n").slice(0, 4).join("\n  ")); throw e; }
};

async function confirmLink(email) {
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (r.messages?.length) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${r.messages[0].ID}`)).json();
      return /href="([^"]*verify[^"]*)"/.exec(m.HTML)[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("e-mail não recebido");
}

const browser = await chromium.launch();
const errors = [];
const newCtx = async (opts = {}) => {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], ...opts });
  ctx.on("page", (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    if (process.env.DEBUG_E2E) p.on("console", (m) => m.text().startsWith("DBG") && console.log("   ", Date.now() % 100000, m.text()));
  });
  return ctx;
};
const login = async (page, { email, password }) => {
  await page.goto(APP);
  await page.getByPlaceholder("nome@email.com").fill(email);
  await page.getByPlaceholder("••••••••").first().fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
};
async function waitMatch(locator, re, timeout = 8000) {
  const end = Date.now() + timeout;
  let last = "";
  while (Date.now() < end) {
    last = money(await locator.innerText());
    if (re.test(last)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`"${last}" não corresponde a ${re}`);
}
const money = (t) => t.replace(/\s| | /g, " ");

try {
  // ---------- Registo ----------
  const ctxU = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pu = await ctxU.newPage();
  await step("1. Registo cria pedido", async () => {
    await pu.goto(APP);
    await pu.screenshot({ path: `${SHOTS}/01-login-mobile.png` });
    await pu.getByRole("button", { name: "Criar conta" }).click();
    await pu.getByPlaceholder("nome@email.com").fill(user.email);
    const pw = pu.getByPlaceholder("••••••••");
    await pw.nth(0).fill(user.password);
    await pw.nth(1).fill(user.password);
    await pu.getByRole("button", { name: "Criar conta" }).click();
    await pu.getByText("Pedido registado").waitFor();
  });
  await step("1b. Confirmação de e-mail leva ao ecrã de conta pendente", async () => {
    await pu.goto(await confirmLink(user.email));
    await pu.getByText("Conta pendente de aprovação").waitFor({ timeout: 15000 });
    await pu.screenshot({ path: `${SHOTS}/02-pendente-mobile.png` });
    assert.equal(await pu.getByText("Financeiro").count(), 0);
  });

  // ---------- Administração ----------
  const ctxA = await newCtx({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pa = await ctxA.newPage();
  await step("2. Admin vê aba Administração e aprova o pedido", async () => {
    await login(pa, ADMIN);
    await pa.getByRole("link", { name: "Administração" }).click();
    await pa.getByPlaceholder("Pesquisar por e-mail").fill(user.email);
    const row = pa.locator("div").filter({ hasText: user.email }).filter({ has: pa.getByRole("button", { name: "Aprovar" }) }).last();
    await row.getByRole("button", { name: "Aprovar" }).click();
    await pa.getByRole("dialog").getByRole("button", { name: "Aprovar" }).click();
    await pa.getByText("Utilizador aprovado.").waitFor();
    await pa.getByPlaceholder("Pesquisar por e-mail").fill("");
    await pa.waitForTimeout(500);
    await pa.screenshot({ path: `${SHOTS}/03-admin-desktop.png` });
  });

  // ---------- Utilizador aprovado ----------
  await step("3. Utilizador aprovado entra; sem aba Administração", async () => {
    await pu.getByRole("button", { name: "Verificar novamente" }).click();
    await pu.getByText("Visão geral").waitFor();
    assert.equal(await pu.getByRole("link", { name: /Admin/ }).count(), 0);
  });
  await step("7/8. Investimentos sucessivos e conversão USDT→MT (20×75, 30×75, 15×75)", async () => {
    for (const q of ["20", "30", "15"]) {
      await pu.getByRole("button", { name: "Adicionar investimento" }).click();
      const d = pu.getByRole("dialog");
      await d.getByPlaceholder("0").fill(q);
      const expected = { 20: "1.500,00 MT", 30: "2.250,00 MT", 15: "1.125,00 MT" }[q];
      await waitMatch(d.locator(".text-gold-300").first(), new RegExp(`^${expected.replace(".", "\\.")}$`));
      if (q === "15") await d.getByRole("button", { name: /Em carteira/ }).click();
      // duplo clique não pode duplicar
      await d.getByRole("button", { name: "Guardar investimento" }).dblclick();
      await pu.getByText(/Investimento de .* guardado/).last().waitFor();
      await d.waitFor({ state: "detached" });
    }
    // 50 carregados, 15 em carteira, 4.875 MT investidos — e nenhum duplicado do duplo clique
    await waitMatch(pu.locator(".card").first().locator("xpath=.."), /50 USDT[\s\S]*\+ 15 USDT em carteira[\s\S]*4\.875,00 MT/);
  });
  await step("9-13. Calcular resultados: 40 USDT, 8 500 MT, 500 MT outras → lucro 5 000 MT, ROAS 2,83×", async () => {
    await pu.getByRole("button", { name: "Calcular resultados" }).first().click();
    const d = pu.getByRole("dialog");
    const inputs = d.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill("40");
    if (process.env.DEBUG_E2E) console.log("   ", Date.now() % 100000, "filled");
    await inputs.nth(2).fill("8500");
    await inputs.nth(3).fill("500");
    await waitMatch(d.locator("aside"), /− 3\.000,00 MT[\s\S]*− 500,00 MT[\s\S]*5\.000,00 MT[\s\S]*2,83×/);
    await pu.screenshot({ path: `${SHOTS}/04-calcular-mobile.png` });
    await d.getByRole("button", { name: "Calcular e guardar" }).click();
    await pu.getByText("Relatório guardado.").waitFor();
  });
  await step("Duplicado acidental é detectado e pede confirmação", async () => {
    await pu.getByRole("button", { name: "Calcular resultados" }).first().click();
    const d = pu.getByRole("dialog");
    const inputs = d.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill("40"); await inputs.nth(2).fill("8500"); await inputs.nth(3).fill("500");
    await d.getByRole("button", { name: "Calcular e guardar" }).click();
    await d.getByText(/Já existe um relatório idêntico/).waitFor();
    await d.getByRole("button", { name: "Fechar" }).click();
  });
  await step("Prejuízo: segundo relatório no mesmo dia (20 USD, 1 000 MT) consolida", async () => {
    await pu.getByRole("button", { name: "Calcular resultados" }).first().click();
    const d = pu.getByRole("dialog");
    await d.getByRole("radio", { name: "USD", exact: true }).click();
    const inputs = d.locator('input[inputmode="decimal"]');
    await inputs.nth(0).fill("20"); await inputs.nth(2).fill("1000");
    await waitMatch(d.locator("aside"), /PREJUÍZO[\s\S]*−500,00 MT/i);
    await d.getByRole("button", { name: "Calcular e guardar" }).click();
    await pu.getByText("Relatório guardado.").waitFor();
    await waitMatch(pu.locator(".card").first(), /4\.500,00 MT/); // 5000 − 500
  });
  await step("14/15. Histórico: abrir dia consolidado e editar relatório", async () => {
    await pu.getByText(/×2/).first().click();
    const d = pu.getByRole("dialog");
    await d.getByText("Consolidado do dia").waitFor();
    await d.getByRole("button", { name: "Editar" }).first().click(); // o mais recente (20 USD)
    const e = pu.getByRole("dialog");
    const inputs = e.locator('input[inputmode="decimal"]');
    await inputs.nth(2).fill("1500");
    await e.getByRole("button", { name: "Guardar alterações" }).click();
    await pu.getByText("Relatório actualizado.").waitFor();
    await waitMatch(pu.locator(".card").first(), /5\.000,00 MT/); // 5000 + (1500 − 1500)
    await pu.waitForTimeout(400);
    await pu.screenshot({ path: `${SHOTS}/05-financeiro-mobile.png`, fullPage: true });
  });

  // ---------- Cofre ----------
  await step("16. Adicionar conta Facebook", async () => {
    await pu.getByRole("link", { name: "Contas" }).click();
    await pu.getByRole("button", { name: "Adicionar conta" }).first().click();
    const d = pu.getByRole("dialog");
    await d.getByPlaceholder("Ex.: Facebook Principal").fill("Facebook Principal");
    await d.getByPlaceholder("exemplo@email.com").fill("exemplo@email.com");
    await d.locator('input[type="password"]').fill("S3nha-FB!");
    await d.getByRole("button", { name: "Guardar no cofre" }).click();
    await pu.getByText("Conta guardada no cofre.").waitFor();
    await pu.getByText("Facebook Principal").waitFor();
    await pu.screenshot({ path: `${SHOTS}/06-contas-mobile.png` });
  });
  await step("17. Pesquisa, detalhe, copiar e-mail, mostrar (com reautenticação), copiar palavra-passe", async () => {
    await pu.getByPlaceholder("Pesquisar por nome ou e-mail").fill("zzz");
    await pu.getByText(/Nenhuma conta corresponde/).waitFor();
    await pu.getByPlaceholder("Pesquisar por nome ou e-mail").fill("princ");
    await pu.getByText("Facebook Principal").click();
    await pu.getByRole("button", { name: "Copiar e-mail" }).click();
    assert.equal(await pu.evaluate(() => navigator.clipboard.readText()), "exemplo@email.com");
    assert.equal(await pu.getByText("S3nha-FB!").count(), 0);
    await pu.getByRole("button", { name: "Mostrar" }).click();
    const d = pu.getByRole("dialog");
    await d.locator('input[type="password"]').fill("errada-123");
    await d.getByRole("button", { name: "Confirmar" }).click();
    await d.getByText("Palavra-passe incorrecta.").waitFor();
    await d.locator('input[type="password"]').fill(user.password);
    await d.getByRole("button", { name: "Confirmar" }).click();
    await pu.getByText("S3nha-FB!").waitFor();
    await pu.screenshot({ path: `${SHOTS}/07-conta-detalhe-mobile.png` });
    await pu.getByRole("button", { name: "Ocultar" }).click();
    assert.equal(await pu.getByText("S3nha-FB!").count(), 0);
    await pu.getByRole("button", { name: "Copiar", exact: true }).click();
    await pu.waitForTimeout(300);
    assert.equal(await pu.evaluate(() => navigator.clipboard.readText()), "S3nha-FB!");
  });

  // ---------- Persistência / sincronização ----------
  await step("20. Actualizar página: nada desaparece", async () => {
    await pu.reload();
    await pu.getByText("Facebook Principal").waitFor();
    await pu.getByRole("link", { name: "Financeiro" }).click();
    await waitMatch(pu.locator(".card").first(), /5\.000,00 MT/);
  });
  await step("5/20/21. Logout e login noutro 'dispositivo' (desktop) recupera tudo", async () => {
    await pu.getByRole("button", { name: "Terminar sessão" }).click();
    await pu.getByText("Bem-vindo de volta").waitFor();
    const ctxD = await newCtx({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const pd = await ctxD.newPage();
    await login(pd, user);
    await pd.getByText("Visão geral").waitFor();
    await waitMatch(pd.locator(".card").first().locator("xpath=.."), /5\.000,00 MT[\s\S]*50 USDT/);
    await pd.waitForTimeout(400);
    await pd.screenshot({ path: `${SHOTS}/08-financeiro-desktop.png`, fullPage: true });
    await pd.getByRole("link", { name: "Contas Facebook" }).click();
    await pd.getByText("Facebook Principal").waitFor();
    await pd.screenshot({ path: `${SHOTS}/09-contas-desktop.png` });
    await pd.goto(`${APP}/admin`);
    await pd.getByText("Visão geral").waitFor(); // utilizador comum redireccionado
    await ctxD.close();
  });
  await step("19. Isolamento na UI: admin não vê dados do utilizador", async () => {
    await pa.getByRole("link", { name: "Financeiro" }).click();
    await pa.getByText("Visão geral").waitFor();
    await pa.waitForTimeout(800);
    assert.doesNotMatch(money(await pa.locator(".card").first().innerText()), /5\.000,00 MT/);
    await pa.getByRole("link", { name: "Contas Facebook" }).click();
    await pa.waitForTimeout(800);
    assert.equal(await pa.getByText("Facebook Principal").count(), 0);
  });
  await step("Suspensão: utilizador perde o acesso", async () => {
    await pa.getByRole("link", { name: "Administração" }).click();
    await pa.getByPlaceholder("Pesquisar por e-mail").fill(user.email);
    const row = pa.locator("div").filter({ hasText: user.email }).filter({ has: pa.getByRole("button", { name: "Suspender" }) }).last();
    await row.getByRole("button", { name: "Suspender" }).click();
    await pa.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
    await pa.getByText("Utilizador suspenso.").waitFor();
    await login(pu, user);
    await pu.getByText("Conta suspensa").waitFor();
  });
  await step("Tablet 820px: navegação inferior visível, sem scroll horizontal", async () => {
    const ctxT = await newCtx({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 });
    const pt = await ctxT.newPage();
    await login(pt, ADMIN);
    await pt.getByText("Visão geral").waitFor();
    assert.ok(await pt.locator("nav.fixed").isVisible());
    const overflow = await pt.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    await pt.screenshot({ path: `${SHOTS}/10-tablet.png` });
    await ctxT.close();
  });
  await step("Sem erros JavaScript na página", async () => { assert.deepEqual(errors, []); });
} finally {
  await browser.close();
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} passos OK`);
  process.exitCode = failed ? 1 : 0;
}
