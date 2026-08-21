import { redirect } from "next/navigation";

export default function DirectPayoutsRedirect() {
  redirect("/originate");
}
