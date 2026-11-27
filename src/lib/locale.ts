import { routing, type AppLocale } from "@/i18n/routing";

export function toLocale(value: unknown): AppLocale {
  return typeof value === "string" &&
    (routing.locales as readonly string[]).includes(value)
    ? (value as AppLocale)
    : routing.defaultLocale;
}

export function localePath(locale: AppLocale, path: string): string {
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Only allow post-login redirects to a path inside the current locale. */
export function safeRedirectPath(
  value: unknown,
  locale: AppLocale,
): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("://")) return null;
  if (!value.startsWith(`/${locale}/`) && value !== `/${locale}`) return null;
  return value;
}
