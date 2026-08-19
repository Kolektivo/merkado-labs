import { redirect } from "next/navigation";

import { merkadoPayAppHref } from "@/lib/pay/config";

export default function AccountPaymentsRedirect() {
  redirect(merkadoPayAppHref().href);
}
