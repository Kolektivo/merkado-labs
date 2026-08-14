export class DualControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DualControlError";
  }
}

export function assertDistinctOfficers(
  instructorId: string,
  signatoryId: string,
): void {
  if (!instructorId || !signatoryId) {
    throw new DualControlError("Release requires two named people.");
  }
  if (instructorId === signatoryId) {
    throw new DualControlError(
      "Two different people must approve. You chose the same person twice.",
    );
  }
}

export function assertReleasesDistinct(
  releases: Array<{ instructorId: string; signatoryId: string | null }>,
): void {
  for (const release of releases) {
    assertDistinctOfficers(release.instructorId, release.signatoryId ?? "");
  }
}
