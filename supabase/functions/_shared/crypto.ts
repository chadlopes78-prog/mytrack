// Criptografia autenticada (AES-256-GCM) para o cofre de credenciais.
// Formato: "v<keyVersion>.<iv base64 (12 bytes)>.<ciphertext+tag base64>"
// O AAD (dados adicionais autenticados) liga cada valor ao seu dono, registo e
// campo: um ciphertext copiado para outro utilizador/registo/campo não decifra.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export type VaultField = "login" | "password" | "notes";

export interface KeyRing {
  current: number;
  keys: Map<number, CryptoKey>;
}

/** Importa as chaves a partir de VAULT_KEYS="1:<base64-32-bytes>,2:<...>" (a maior versão é a actual). */
export async function loadKeyRing(spec: string | undefined): Promise<KeyRing> {
  if (!spec) throw new Error("VAULT_KEYS is not configured");
  const keys = new Map<number, CryptoKey>();
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const [v, b64] = part.split(":");
    const version = Number(v);
    const raw = fromB64(b64 ?? "");
    if (!Number.isInteger(version) || version < 1 || raw.length !== 32) {
      throw new Error("Invalid VAULT_KEYS entry");
    }
    keys.set(version, await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  }
  if (keys.size === 0) throw new Error("VAULT_KEYS is empty");
  return { current: Math.max(...keys.keys()), keys };
}

function aad(userId: string, recordId: string, field: VaultField): Uint8Array {
  return encoder.encode(`baron-vault|${userId}|${recordId}|${field}`);
}

export async function encryptField(
  ring: KeyRing, userId: string, recordId: string, field: VaultField, plaintext: string,
): Promise<string> {
  const key = ring.keys.get(ring.current)!;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(userId, recordId, field) },
    key, encoder.encode(plaintext),
  ));
  return `v${ring.current}.${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptField(
  ring: KeyRing, userId: string, recordId: string, field: VaultField, payload: string,
): Promise<string> {
  const m = /^v(\d+)\.([A-Za-z0-9+/=]+)\.([A-Za-z0-9+/=]+)$/.exec(payload);
  if (!m) throw new Error("Malformed ciphertext");
  const key = ring.keys.get(Number(m[1]));
  if (!key) throw new Error("Unknown key version");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(m[2]), additionalData: aad(userId, recordId, field) },
    key, fromB64(m[3]),
  );
  return decoder.decode(pt);
}
