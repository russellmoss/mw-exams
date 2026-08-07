import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Reads ENCRYPTION_KEY, tolerating the wrapper a hex secret picks up on its way into a dashboard:
 * a UTF-8 BOM on the front and a trailing CRLF. Neither is ever part of a hex key, so stripping
 * them cannot mask a real misconfiguration.
 *
 * This is not hypothetical. Production ran with a 69-character value — BOM + the correct 64 hex
 * chars + CRLF, the signature of a key pasted out of a PowerShell-written file — and the old
 * `length !== 64` check threw on every single encrypt(). Every attempt to store a BYOK key 500'd
 * for the life of that deployment: `user_api_keys` held zero rows across the whole user table, and
 * signup died *after* creating the account (see the register route). The key material was right;
 * only the wrapper was wrong.
 */
function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  // U+FEFF is the BOM decoded as UTF-8; the ï»¿ form is the same three bytes decoded as Latin-1,
  // which is how it survives a round trip through a dashboard that guessed the wrong encoding.
  const key = raw.replace(/^(﻿|ï»¿)/, "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    // Describe the shape, never the value — this message reaches the logs.
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex chars (32 bytes); got ${key.length} chars after trimming`
    );
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ciphertext] = encoded.split(":");
  if (!ivHex || !tagHex || !ciphertext) {
    throw new Error("Invalid encrypted format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
