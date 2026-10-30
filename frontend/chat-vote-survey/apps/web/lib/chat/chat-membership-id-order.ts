export function isStrictlyAscendingByMembershipId(
  items: readonly Readonly<{ membershipId: string }>[],
): boolean {
  for (let index = 1; index < items.length; index += 1) {
    const previousMembershipId = items[index - 1]?.membershipId;
    const currentMembershipId = items[index]?.membershipId;

    if (
      previousMembershipId === undefined ||
      currentMembershipId === undefined ||
      !(previousMembershipId < currentMembershipId)
    ) {
      return false;
    }
  }

  return true;
}
