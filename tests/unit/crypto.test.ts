import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptField, encryptField, loadKeyRing } from "../../supabase/functions/_shared/crypto";

const key = () => randomBytes(32).toString("base64");

describe("cofre — AES-256-GCM", () => {
  it("cifra e decifra; IV aleatório por valor", async () => {
    const ring = await loadKeyRing(`1:${key()}`);
    const a = await encryptField(ring, "u1", "r1", "password", "S3gredo!");
    const b = await encryptField(ring, "u1", "r1", "password", "S3gredo!");
    expect(a).not.toBe(b);
    expect(a).not.toContain("S3gredo");
    expect(await decryptField(ring, "u1", "r1", "password", a)).toBe("S3gredo!");
  });
  it("falha se o valor for movido para outro utilizador, registo ou campo", async () => {
    const ring = await loadKeyRing(`1:${key()}`);
    const c = await encryptField(ring, "u1", "r1", "password", "x");
    await expect(decryptField(ring, "u2", "r1", "password", c)).rejects.toThrow();
    await expect(decryptField(ring, "u1", "r2", "password", c)).rejects.toThrow();
    await expect(decryptField(ring, "u1", "r1", "login", c)).rejects.toThrow();
  });
  it("detecta adulteração", async () => {
    const ring = await loadKeyRing(`1:${key()}`);
    const c = await encryptField(ring, "u", "r", "login", "a@b.c");
    const [v, iv, ct] = c.split(".");
    const bytes = Buffer.from(ct, "base64"); bytes[0] ^= 1;
    await expect(decryptField(ring, "u", "r", "login", `${v}.${iv}.${bytes.toString("base64")}`)).rejects.toThrow();
  });
  it("rotação de chaves: novas cifras usam a versão maior, antigas continuam legíveis", async () => {
    const k1 = key();
    const old = await encryptField(await loadKeyRing(`1:${k1}`), "u", "r", "notes", "n");
    const ring = await loadKeyRing(`1:${k1},2:${key()}`);
    expect(await decryptField(ring, "u", "r", "notes", old)).toBe("n");
    expect((await encryptField(ring, "u", "r", "notes", "n")).startsWith("v2.")).toBe(true);
  });
  it("rejeita configuração inválida", async () => {
    await expect(loadKeyRing(undefined)).rejects.toThrow();
    await expect(loadKeyRing("1:abc")).rejects.toThrow();
  });
});
