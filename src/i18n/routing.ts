import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"] as const,
  defaultLocale: "en",
  localePrefix: "always",
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];
