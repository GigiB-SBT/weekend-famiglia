import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required").pipe(z.url()),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Treat empty strings (e.g. `FOO=` in .env) as unset. */
function normalize(source: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
}

/** Pure validation, exported for tests. Throws a readable Error on failure. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(normalize(source));
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazy: validates on first call only, so `next build` works without env vars. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
