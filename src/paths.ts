import path from "node:path";

/**
 * Resolves the data directory: `DATA_DIR` env, else `<cwd>/data`.
 */
export function resolveDataDir(): string {
  const raw = process.env.DATA_DIR?.trim();
  if (raw && raw.length > 0) {
    return path.resolve(raw);
  }
  return path.resolve(process.cwd(), "data");
}
