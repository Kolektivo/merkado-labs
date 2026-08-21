import { redirect } from "next/navigation";

export default function AccountPayoutsRedirect() {
  redirect("/originate");
}
