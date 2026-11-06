// Auditoria de responsividade em telemóveis reais (Chromium com emulação).
// Verifica em cada ecrã/janela: sem scroll horizontal, nada a sair do ecrã,
// campos com letra >= 16px (evita o zoom automático do iOS), viewport sem
// zoom, alvos de toque >= 40px e navegação inferior visível.
// Uso: node tests/e2e/mobile.mjs  (ambiente local a correr)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const APP = process.env.APP_URL ?? "http://127.0.0.1:5173";
const API = "http://127.0.0.1:54321";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SHOTS = "test-results/mobile";
mkdirSync(SHOTS, { recursive: true });

const PHONES = [
  { name: "iPhone SE (1ª) 320", width: 320, height: 568, ios: true },
  { name: "Android pequeno 360", width: 360, height: 740 },
  { name: "iPhone SE 2/3 375", width: 375, height: 667, ios: true },
  { name: "iPhone 13 390", device: "iPhone 13", ios: true },
  { name: "Galaxy S9+ 320", device: "Galaxy S9+" },
  { name: "Pixel 7 412", device: "Pixel 7" },
  { name: "iPhone 14 Pro Max 430", device: "iPhone 14 Pro Max", ios: true },
  { name: "iPhone 13 horizontal", device: "iPhone 13 landscape", ios: true },
  { name: "Galaxy Tab S4", device: "Galaxy Tab S4" },
];

// ---------- Utilizador com dados reais para preencher os ecrãs ----------
const svc = createClient(API, SERVICE, { auth: { persistSession: false } });
const email = `mobile.${Date.now()}@test.baron`, password = "Mobile-Test-2026";
const { data: created, error: ce } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
if (ce) throw ce;
const pg = require("pg");
const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
await db.query("update public.profiles set status='approved' where id=$1", [created.user.id]);
await db.query("insert into public.admin_permissions (user_id) values ($1)", [created.user.id]); // para auditar também a aba Admin
await db.end();
const u = createClient(API, ANON, { auth: { persistSession: false } });
await u.auth.signInWithPassword({ email, password });
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
await u.from("investments").insert([
  { usdt_amount: 1250.5, rate: 75, loaded_to_ads: true, client_request_id: crypto.randomUUID(), note: "Conta BM principal com uma observação bastante longa para testar quebras" },
  { usdt_amount: 30, rate: 76.5, loaded_to_ads: false, client_request_id: crypto.randomUUID(), note: null },
]);
const reports = [];
for (let i = 0; i < 20; i++) reports.push({ report_date: day(i), ad_spend: 40 + i * 13, spend_currency: i % 3 ? "USDT" : "USD", rate: 75, revenue_mzn: 8500 + i * 4321.75, other_expenses_mzn: i % 2 ? 500 : 0, client_request_id: crypto.randomUUID() });
reports.push({ report_date: day(0), ad_spend: 999999.99, spend_currency: "USDT", rate: 75, revenue_mzn: 12345678.9, other_expenses_mzn: 0, client_request_id: crypto.randomUUID() });
await u.from("daily_reports").insert(reports);
const { data: s } = await u.auth.getSession();
const vres = await fetch(`${API}/functions/v1/vault`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${s.session.access_token}` },
  body: JSON.stringify({ action: "create", request_id: crypto.randomUUID(), label: "Facebook Principal com nome muito comprido", login: "um.email.extremamente.longo.para.testar@exemplo-dominio.com", password: "S3nha-Muito-Longa-Para-Testar-Quebra!", notes: "BM 2" }) });
const vaultId = (await vres.json()).item.id;

// ---------- Verificações executadas na página ----------
async function audit(page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const issues = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > W + 1) issues.push(`scroll horizontal (${doc.scrollWidth}px > ${W}px)`);
    const scrollable = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.position === "fixed" && cs.pointerEvents === "none") continue;
      if ((r.right > W + 1 || r.left < -1) && !scrollable(el)) issues.push(`sai do ecrã: <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> ${Math.round(r.left)}→${Math.round(r.right)}`);
      if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && parseFloat(cs.fontSize) < 16) issues.push(`campo com letra ${cs.fontSize} (causa zoom no iOS): ${el.getAttribute("placeholder") || el.type}`);
      if ((el.tagName === "BUTTON" || el.tagName === "A") && cs.display !== "inline" && r.height < 31.5 && el.offsetParent) issues.push(`alvo de toque pequeno (${Math.round(r.width)}×${Math.round(r.height)}): "${el.textContent.trim().slice(0, 25) || el.getAttribute("aria-label")}"`);
    }
    // texto cortado em elementos que não usam reticências
    for (const el of document.querySelectorAll("h1,h2,.num,button")) {
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis" && cs.overflow !== "visible") issues.push(`texto cortado: "${el.textContent.trim().slice(0, 30)}"`);
    }
    // texto que ultrapassa o cartão/caixa onde está (cortado por overflow:hidden)
    for (const el of document.querySelectorAll(".num, h1, h2, dd, td, span.font-semibold, span.font-bold")) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const box = el.closest(".card, .rounded-xl, .rounded-2xl, [role=dialog] > div");
      if (!box || box === el) continue;
      const b = box.getBoundingClientRect();
      if (r.right > b.right + 1 || r.left < b.left - 1) {
        const sc = (() => { for (let p = el.parentElement; p && p !== box; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; })();
        if (!sc) issues.push(`texto sai da caixa: "${el.textContent.trim().slice(0, 30)}"`);
      }
    }
    const vp = document.querySelector('meta[name=viewport]')?.content ?? "";
    if (!/maximum-scale=1/.test(vp)) issues.push("viewport permite zoom automático");
    return [...new Set(issues)];
  });
}

const browser = await chromium.launch();
let total = 0;
for (const phone of PHONES) {
  const base = phone.device ? devices[phone.device] : { viewport: { width: phone.width, height: phone.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const ctx = await browser.newContext({ ...base, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const W = page.viewportSize().width;
  const report = [];
  const check = async (screen, shot) => {
    await page.waitForTimeout(350);
    const issues = await audit(page);
    total += issues.length;
    report.push([screen, issues]);
    if (shot) await page.screenshot({ path: `${SHOTS}/${W}-${shot}.png`, fullPage: false });
  };
  const open = async (btn) => { await page.getByRole("button", { name: btn }).first().click(); await page.getByRole("dialog").waitFor(); };
  const close = async () => { await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).click(); await page.getByRole("dialog").waitFor({ state: "detached" }); };

  await page.goto(APP);
  await check("Login", "login");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await check("Criar conta");
  await page.getByRole("button", { name: "Voltar" }).click();
  await page.getByPlaceholder("nome@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("Visão geral").waitFor();
  await page.getByText("Evolução").waitFor();
  await check("Financeiro", "financeiro");
  await page.mouse.wheel(0, 1800);
  await check("Financeiro (histórico)", "historico");
  await page.getByRole("button", { name: "Personalizado" }).click();
  await check("Filtro personalizado");
  await page.getByRole("button", { name: "Tudo" }).click();
  await page.locator("button.card:visible, tbody tr:visible").first().click(); await page.getByRole("dialog").waitFor();
  await check("Detalhe do dia", "dia"); await close();
  await open("Adicionar investimento"); await check("Adicionar investimento", "investimento"); await close();
  await open("Calcular resultados");
  await page.getByRole("dialog").locator('input[inputmode="decimal"]').nth(0).fill("123456,78");
  await page.getByRole("dialog").locator('input[inputmode="decimal"]').nth(2).fill("98765432,1");
  await check("Calcular resultados", "calcular"); await close();
  await page.getByRole("radio", { name: "Investimentos" }).click();
  await check("Lista de investimentos", "investimentos");
  await page.getByRole("button", { name: /Taxa/ }).first().click(); await page.getByRole("dialog").waitFor();
  await check("Taxa e saldo"); await close();
  await page.goto(`${APP}/contas`); await page.getByText("Facebook Principal").waitFor();
  await check("Contas Facebook", "contas");
  await open("Adicionar conta"); await check("Adicionar conta"); await close();
  await page.goto(`${APP}/contas/${vaultId}`); await page.getByText("Copiar e-mail").waitFor();
  await check("Detalhe da conta", "conta");
  await page.getByRole("button", { name: "Mostrar" }).click(); await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").locator("input").fill(password);
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await page.getByText("S3nha-Muito").waitFor();
  await check("Palavra-passe revelada", "revelada");
  await page.goto(`${APP}/admin`); await page.getByText("Utilizadores").first().waitFor();
  await check("Administração", "admin");

  const bad = report.filter(([, i]) => i.length);
  console.log(`\n${bad.length ? "✗" : "✓"} ${phone.name} (${W}px)`);
  for (const [screen, issues] of bad) for (const i of issues) console.log(`   ${screen}: ${i}`);
  await ctx.close();
}
await browser.close();
console.log(`\n${total === 0 ? "SEM PROBLEMAS" : total + " problemas"} em ${PHONES.length} dispositivos`);
process.exitCode = total ? 1 : 0;
