/** Tiny class-name joiner (no dependency on clsx). Filters falsey values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
