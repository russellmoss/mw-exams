import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(appDir, p), "utf8");

// The 2026-08-07 signup outage, pinned.
//
// Production held a 69-character ENCRYPTION_KEY: a UTF-8 BOM, the correct 64 hex chars, and a
// trailing CRLF — the signature of a secret pasted out of a PowerShell-written file. The old check
// was `key.length !== 64`, so every encrypt() threw, every BYOK key save 500'd, and
// `user_api_keys` sat empty across the entire user table. Nobody noticed because the only symptom
// was a 500 on a page people rarely revisit.
//
// Two independent things have to hold for that to stay fixed: the key reader must tolerate the
// wrapper, and registration must not be able to half-succeed when encryption is broken.

const VALID = "a".repeat(64);
const original = process.env.ENCRYPTION_KEY;

/** Fresh module per case — getEncryptionKey reads process.env at call time, but be explicit. */
async function loadCrypto() {
  return import("@/lib/encryption");
}

describe("ENCRYPTION_KEY tolerates paste artifacts", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });

  it("round-trips a clean 64-char hex key", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    expect(decrypt(encrypt("sk-ant-secret"))).toBe("sk-ant-secret");
  });

  it("accepts the exact production value: BOM + 64 hex + CRLF", async () => {
    // 3 + 64 + 2 = 69 characters, which is what Vercel actually held.
    process.env.ENCRYPTION_KEY = `﻿${VALID}\r\n`;
    const { encrypt, decrypt } = await loadCrypto();
    expect(decrypt(encrypt("sk-ant-secret"))).toBe("sk-ant-secret");
  });

  it("accepts a BOM that was decoded as Latin-1 on its way through a dashboard", async () => {
    process.env.ENCRYPTION_KEY = `ï»¿${VALID}`;
    const { encrypt } = await loadCrypto();
    expect(() => encrypt("x")).not.toThrow();
  });

  it("still refuses a key that is genuinely the wrong length", async () => {
    process.env.ENCRYPTION_KEY = "a".repeat(32);
    const { encrypt } = await loadCrypto();
    expect(() => encrypt("x")).toThrow(/64 hex chars/);
  });

  it("still refuses 64 characters that are not hex", async () => {
    // The old length-only check would have passed this and failed later inside createCipheriv.
    process.env.ENCRYPTION_KEY = "z".repeat(64);
    const { encrypt } = await loadCrypto();
    expect(() => encrypt("x")).toThrow(/64 hex chars/);
  });

  it("names the variable when it is missing entirely", async () => {
    delete process.env.ENCRYPTION_KEY;
    const { encrypt } = await loadCrypto();
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY is not set/);
  });

  it("never puts the key material in the error message", async () => {
    process.env.ENCRYPTION_KEY = "deadbeef".repeat(2);
    const { encrypt } = await loadCrypto();
    try {
      encrypt("x");
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("deadbeef");
    }
  });
});

describe("registration cannot strand an account", () => {
  const register = read("src/app/api/auth/register/route.ts");

  it("encrypts every key before the user row is written", () => {
    // These statements share no transaction. If encryption throws after the INSERT, the account
    // exists with no keys, the caller sees a 500, and their retry gets 409 "already exists" — an
    // unrecoverable state reached by doing nothing wrong. Ordering is the whole fix.
    const sealed = register.indexOf("sealKey(\"anthropic\"");
    const insertUser = register.indexOf("INSERT INTO users");
    expect(sealed).toBeGreaterThan(-1);
    expect(insertUser).toBeGreaterThan(-1);
    expect(sealed).toBeLessThan(insertUser);
  });

  it("does not call encrypt() after the user INSERT", () => {
    const insertUser = register.indexOf("INSERT INTO users");
    expect(register.slice(insertUser)).not.toMatch(/\bencrypt\(/);
  });
});
