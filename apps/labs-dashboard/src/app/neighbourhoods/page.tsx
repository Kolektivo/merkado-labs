import { permanentRedirect } from "next/navigation";

export default function NeighbourhoodsRedirect() {
  permanentRedirect("/quality?tab=location");
}
