import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { toLocale } from "@/lib/locale";
import { CheckInForm } from "./form";

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale: raw } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  await requireProfile(locale);
  const t = await getTranslations("checkIn");
  const { code } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CheckInForm locale={locale} initialCode={(code ?? "").slice(0, 32)} />
    </div>
  );
}
