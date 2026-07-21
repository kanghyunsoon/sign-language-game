export function isLocalPeerOfferer(localUserId: string, remoteUserId: string): boolean {
  if (localUserId === remoteUserId) throw new Error("A peer cannot negotiate with itself.");
  return localUserId.localeCompare(remoteUserId, "en") < 0;
}
