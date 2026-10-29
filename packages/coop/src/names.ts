/** Player names, for the co-op lobby and the hiscores alike. */

export const NAME_MAX = 16;
/** Letters, digits, spaces, hyphens and underscores; no leading, trailing or double spaces. */
export const NAME_PATTERN = /^[\p{L}\p{N}_-]+( [\p{L}\p{N}_-]+)*$/u;

/** Trims and squeezes spaces; null if the name isn't allowed. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return [...name].length <= NAME_MAX && NAME_PATTERN.test(name) ? name : null;
}
