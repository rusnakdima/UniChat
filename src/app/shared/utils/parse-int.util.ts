export function parseIntOrNull(value: string | null, radix = 10): number | null {
  if (value === null || value === undefined) return null;
  const parsed = parseInt(value, radix);
  return isNaN(parsed) ? null : parsed;
}
