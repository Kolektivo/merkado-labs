export type NativeListingAction =
  | "publish"
  | "unpublish"
  | "mark_sold"
  | "mark_rented"
  | "republish";

/**
 * Mirrors the lifecycle transition guards in service.ts so the UI only offers
 * actions the atomic RPC can accept.
 */
export function availableNativeListingActions(
  status: string,
): NativeListingAction[] {
  if (status === "draft") return ["publish"];
  if (status === "unpublished") {
    return ["republish", "mark_sold", "mark_rented"];
  }
  if (status === "active") return ["unpublish", "mark_sold", "mark_rented"];
  if (status === "sold" || status === "inactive") return ["republish"];
  return [];
}
