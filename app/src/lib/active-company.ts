export const ACTIVE_COMPANY_COOKIE_NAME = "activeCompanyId";
export const ACTIVE_COMPANY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseActiveCompanyId(rawValue: string | undefined): number | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const parsedId = Number(rawValue);
  if (!Number.isInteger(parsedId) || parsedId < 1) {
    return null;
  }

  return parsedId;
}
