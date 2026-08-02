import { describe, it, expect } from "vitest";
import { generateToken, hashToken, hashesEqual } from "../src/lib/reset-tokens";
import { decideAccountAction } from "../src/lib/google-oauth";
import {
  resetPasswordHtml,
  resetPasswordText,
} from "../src/lib/email-templates/reset-password";

describe("reset token generation", () => {
  it("produces URL-safe tokens with no padding", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("produces 32 bytes of entropy", () => {
    // 32 bytes base64url-encoded is 43 characters.
    expect(generateToken()).toHaveLength(43);
  });

  it("never repeats a token", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(seen.size).toBe(500);
  });
});

describe("reset token hashing", () => {
  it("never stores anything resembling the raw token", () => {
    // The whole point of hashing: a database dump must not yield usable reset links.
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("gives different hashes for different tokens", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it("compares equal hashes as equal and unequal as unequal", () => {
    const a = hashToken("one");
    const b = hashToken("two");
    expect(hashesEqual(a, a)).toBe(true);
    expect(hashesEqual(a, b)).toBe(false);
  });

  it("returns false rather than throwing on length mismatch", () => {
    // timingSafeEqual throws if the buffers differ in length; a malformed token must not 500.
    expect(hashesEqual(hashToken("x"), "short")).toBe(false);
    expect(hashesEqual("", hashToken("x"))).toBe(false);
  });
});

describe("Google account linking decisions", () => {
  const verified = { emailVerified: true };
  const unverified = { emailVerified: false };

  it("signs in when the google_sub is already linked", () => {
    expect(decideAccountAction(verified, { id: 7 }, null)).toEqual({ kind: "signin", userId: 7 });
  });

  it("links a verified Google email to an existing password account", () => {
    expect(decideAccountAction(verified, null, { id: 2 })).toEqual({ kind: "link", userId: 2 });
  });

  it("creates a new account when nothing matches", () => {
    expect(decideAccountAction(verified, null, null)).toEqual({ kind: "create" });
  });

  // The account-takeover case. Google issues id_tokens for unverified addresses; if we linked on
  // email alone, an attacker could register a Google account claiming someone else's address and
  // be handed their account.
  it("REFUSES to link an unverified Google email to an existing account", () => {
    expect(decideAccountAction(unverified, null, { id: 2 })).toEqual({
      kind: "refuse",
      reason: "email_unverified",
    });
  });

  it("REFUSES to create an account from an unverified Google email", () => {
    expect(decideAccountAction(unverified, null, null)).toEqual({
      kind: "refuse",
      reason: "email_unverified",
    });
  });

  it("still signs in an already-linked sub even if email_verified is now false", () => {
    // The trust decision was made when the link was established; sub is stable and unforgeable.
    expect(decideAccountAction(unverified, { id: 7 }, { id: 7 })).toEqual({
      kind: "signin",
      userId: 7,
    });
  });

  it("prefers the google_sub match over an email match on a different account", () => {
    expect(decideAccountAction(verified, { id: 7 }, { id: 99 })).toEqual({
      kind: "signin",
      userId: 7,
    });
  });
});

describe("reset email template", () => {
  const input = {
    name: "Russell Moss",
    resetUrl: "https://example.com/reset-password?token=abc123",
    expiryMinutes: 60,
  };

  it("includes the reset URL in both the button and the fallback", () => {
    const html = resetPasswordHtml(input);
    const occurrences = html.split(input.resetUrl).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("states the expiry in both html and text", () => {
    expect(resetPasswordHtml(input)).toContain("60 minutes");
    expect(resetPasswordText(input)).toContain("60 minutes");
  });

  it("leaves no unsubstituted template placeholders", () => {
    const html = resetPasswordHtml(input);
    expect(html).not.toMatch(/\$\{/);
    expect(html).not.toMatch(/\bundefined\b/);
    expect(resetPasswordText(input)).not.toMatch(/\$\{/);
  });

  it("escapes HTML in the user's name", () => {
    // Names come from the database; an unescaped one would inject markup into the email.
    const html = resetPasswordHtml({ ...input, name: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the reset URL", () => {
    const html = resetPasswordHtml({ ...input, resetUrl: 'https://e.com/?t="><script>' });
    expect(html).not.toContain('"><script>');
  });

  it("uses the Cellar palette rather than default styling", () => {
    const html = resetPasswordHtml(input);
    expect(html).toContain("#0c0a09"); // background
    expect(html).toContain("#1c1917"); // card
    expect(html).toContain("#d97706"); // accent
  });

  it("ships a plaintext alternative with the bare URL", () => {
    const text = resetPasswordText(input);
    expect(text).toContain(input.resetUrl);
    expect(text).not.toContain("<");
  });
});
