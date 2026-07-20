import { permanentRedirect } from "next/navigation";

export default function LifecycleRedirect() {
  permanentRedirect("/quality?tab=lifecycle");
}
