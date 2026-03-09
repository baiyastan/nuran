/**
 * Returns display name for a category by stripping the " (Root)" suffix when present.
 * Used for UI display only; does not change stored names or API payloads.
 */
export function displayCategoryName(name: string): string {
  const suffix = ' (Root)'
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
}
