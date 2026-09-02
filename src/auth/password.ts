/** Password hashing with Node's scrypt; no extra dependency. Format: scrypt$<salt hex>$<hash hex>. */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = scryptSync(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function generatePassword(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
