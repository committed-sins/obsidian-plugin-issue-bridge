export function isRecord(value: unknown): value is Record<string, unknown>
{
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isIssueNumber(value: unknown): value is number
{
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
