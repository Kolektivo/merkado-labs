import { permanentRedirect } from "next/navigation";

export default function SourceRunsRedirect() {
  permanentRedirect("/sources");
}
