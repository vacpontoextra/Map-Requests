/** Tags are stored as a JSON string because SQLite has no array type. */
export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}
