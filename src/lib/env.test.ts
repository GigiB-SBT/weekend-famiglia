import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("parseEnv", () => {
  it("accepts required vars and treats NEXT_PUBLIC_SITE_URL as optional", () => {
    const env = parseEnv(valid);
    expect(env.SUPABASE_URL).toBe(valid.SUPABASE_URL);
    expect(env.NEXT_PUBLIC_SITE_URL).toBeUndefined();
  });

  it("treats an empty NEXT_PUBLIC_SITE_URL as unset", () => {
    expect(parseEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "" }).NEXT_PUBLIC_SITE_URL).toBeUndefined();
  });

  it("throws a readable error naming the missing variables", () => {
    expect(() => parseEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => parseEnv({})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("rejects a malformed SUPABASE_URL", () => {
    expect(() => parseEnv({ ...valid, SUPABASE_URL: "not-a-url" })).toThrow(/SUPABASE_URL/);
  });

  it("rejects a malformed NEXT_PUBLIC_SITE_URL", () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "nope" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
