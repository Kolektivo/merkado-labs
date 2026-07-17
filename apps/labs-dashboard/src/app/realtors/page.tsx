import { permanentRedirect } from "next/navigation";

export default function RealtorsRedirect() {
  permanentRedirect("/listings");
}
