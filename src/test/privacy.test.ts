import { describe, expect, it } from "vitest";
import { createLockRecord, setupIssue, verifyPassphrase } from "../lib/privacy";

const hasSubtle = typeof globalThis.crypto?.subtle !== "undefined";

describe("practitioner password", () => {
  it("checks the setup form before saving", () => {
    expect(setupIssue("abc", "abc")).toMatch(/at least/i);
    expect(setupIssue("callofh", "callof")).toMatch(/match/i);
    expect(setupIssue("callofh", "callofh")).toBeNull();
  });

  (hasSubtle ? it : it.skip)("accepts the right password and rejects a wrong one", async () => {
    const record = await createLockRecord("chin area 7");
    const other = await createLockRecord("chin area 7");

    expect(await verifyPassphrase("chin area 7", record)).toBe(true);
    expect(await verifyPassphrase("chin area 8", record)).toBe(false);
    expect(record.salt).not.toBe(other.salt);
    expect(record.hash).not.toContain("chin area 7");
  });
});
