/**
 * Shared port-env-var validation (NF52) — used by index.ts's PORT and
 * channel.ts/app.ts's CHANNEL_PORT, so an invalid value fails fast with a
 * clear error instead of a low-level bind/listen/fetch failure.
 *
 * 0 is accepted (not just 1–65535): Node's listen()/serve() treat it as "let
 * the OS assign a free port", which tests/unit/server/index.test.ts already
 * relies on for ephemeral test binding.
 */
export function parsePort(value: string | undefined, fallback: number, envVarName: string): number {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid ${envVarName} "${value}": must be an integer between 0 and 65535.`);
  }
  return port;
}
