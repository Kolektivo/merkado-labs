import { permanentRedirect } from "next/navigation";

export default function EligibilityRedirect() {
  permanentRedirect("/quality");
}
