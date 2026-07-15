/** Small state machine used by the map to distinguish an empty click from a
 * pointer gesture that moved the map. */
export class DragSafeClickGuard {
  private dragged = false;

  pointerDown(): void {
    this.dragged = false;
  }

  markDragged(): void {
    this.dragged = true;
  }

  canHandleClick(): boolean {
    return !this.dragged;
  }
}

export function classifyScenarioMembership(
  geoid: string,
  current: ReadonlySet<string>,
  pinned?: ReadonlySet<string> | null,
): "none" | "current" | "pinned" | "shared" {
  const inCurrent = current.has(geoid);
  const inPinned = pinned?.has(geoid) ?? false;
  if (inCurrent && inPinned) return "shared";
  if (inCurrent) return "current";
  if (inPinned) return "pinned";
  return "none";
}
