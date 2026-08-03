import { describe, it, expect } from "vitest";
import { shouldCommitOnEnter, isDatalistCommit } from "../src/lib/chip-input";

/**
 * These guard a shortcut collision, not a feature. Stem Sniper binds Enter to "add wine" and
 * Ctrl/⌘+Enter to "submit"; committing a chip on Enter has to slot in without stealing either.
 */

const VARIETIES = ["Chardonnay", "Chenin Blanc", "Riesling", "Sémillon"];

describe("shouldCommitOnEnter", () => {
  describe("multi mode (hedging on — Stem Sniper)", () => {
    const multi = true;

    it("commits a bare Enter when text is pending", () => {
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "Riesling" })).toBe(true);
    });

    it("leaves Enter alone on an empty field so it still adds a wine", () => {
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "" })).toBe(false);
    });

    it("treats whitespace-only as empty", () => {
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "   " })).toBe(false);
    });

    it("never swallows Ctrl+Enter, with or without text", () => {
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "Riesling", ctrlKey: true })).toBe(false);
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "", ctrlKey: true })).toBe(false);
    });

    it("never swallows ⌘+Enter, with or without text", () => {
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "Riesling", metaKey: true })).toBe(false);
      expect(shouldCommitOnEnter({ multi, key: "Enter", pending: "", metaKey: true })).toBe(false);
    });

    it("ignores other keys", () => {
      for (const key of ["a", "Backspace", "Tab", ",", "Escape"]) {
        expect(shouldCommitOnEnter({ multi, key, pending: "Riesling" })).toBe(false);
      }
    });
  });

  describe("single mode (max === 1 — Reverse Tasting) is untouched", () => {
    const multi = false;

    it("never commits, in any Enter combination", () => {
      for (const mods of [{}, { ctrlKey: true }, { metaKey: true }]) {
        for (const pending of ["", "Riesling"]) {
          expect(shouldCommitOnEnter({ multi, key: "Enter", pending, ...mods })).toBe(false);
        }
      }
    });
  });
});

describe("isDatalistCommit", () => {
  const multi = true;
  const options = VARIETIES;

  it("commits when the dropdown is picked (no inputType) and the value matches an option", () => {
    expect(isDatalistCommit({ multi, value: "Riesling", inputType: undefined, options })).toBe(true);
  });

  it("matches case- and whitespace-insensitively", () => {
    expect(isDatalistCommit({ multi, value: "  riesling ", inputType: undefined, options })).toBe(true);
  });

  it("does not commit while typing, even once the text matches exactly", () => {
    expect(isDatalistCommit({ multi, value: "Riesling", inputType: "insertText", options })).toBe(false);
  });

  it("does not commit a prefix that merely starts an option", () => {
    expect(isDatalistCommit({ multi, value: "Ries", inputType: undefined, options })).toBe(false);
  });

  it("does not commit a value absent from the list", () => {
    expect(isDatalistCommit({ multi, value: "Assyrtiko", inputType: undefined, options })).toBe(false);
  });

  it("does not commit on paste", () => {
    expect(isDatalistCommit({ multi, value: "Riesling", inputType: "insertFromPaste", options })).toBe(false);
  });

  it("does not commit an empty value (e.g. a cleared field)", () => {
    expect(isDatalistCommit({ multi, value: "", inputType: undefined, options })).toBe(false);
    expect(isDatalistCommit({ multi, value: "  ", inputType: undefined, options })).toBe(false);
  });

  it("never commits in single mode", () => {
    expect(isDatalistCommit({ multi: false, value: "Riesling", inputType: undefined, options })).toBe(false);
  });

  it("handles accented options", () => {
    expect(isDatalistCommit({ multi, value: "sémillon", inputType: undefined, options })).toBe(true);
  });
});
