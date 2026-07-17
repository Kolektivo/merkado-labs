import { permanentRedirect } from "next/navigation";

export default function MapRedirect() {
  permanentRedirect("/listings?view=map");
}
