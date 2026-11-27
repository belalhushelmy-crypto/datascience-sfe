"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toLocale } from "@/lib/locale";

export async function logoutAction(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
