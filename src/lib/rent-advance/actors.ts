import { DEMO_RENTER_PROFILE } from "@/lib/demo-account-profile";
import type { Actor } from "@/lib/rent-advance/types";

export const ACTORS: Actor[] = [
  {
    id: "act-martina",
    name: "D. Martina",
    initials: "DM",
    role: "operations",
    title: "Operations · Merkado",
  },
  {
    id: "act-girigoria",
    name: "R. Girigoria",
    initials: "RG",
    role: "independent_approver",
    title: "Independent approver",
  },
  {
    id: "act-sambo",
    name: "A. Sambo",
    initials: "AS",
    role: "foundation_signatory",
    title: "Foundation signatory",
  },
  {
    id: "act-purchaser",
    name: "Merkado Receivables I B.V.",
    initials: "JV",
    role: "purchaser",
    title: "Sole holder · book entry",
  },
  {
    id: "act-payer-001",
    name: DEMO_RENTER_PROFILE.fullName,
    initials: DEMO_RENTER_PROFILE.initials,
    role: "payer",
    title: "Payer · MRA-001",
  },
  {
    id: "act-landlord-001",
    name: "Demo landlord",
    initials: "LL",
    role: "landlord",
    title: "Landlord · MRA-001",
  },
];

export function actorById(id: string) {
  return ACTORS.find((actor) => actor.id === id) ?? ACTORS[0];
}
