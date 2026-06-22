/**
 * Embed node (FR-EDITOR-03): paste a YouTube / Vimeo / Loom URL and render it
 * as a responsive iframe inside the document. Stored as a single atom node with
 * a normalized `src` (the provider embed URL), so the same extension can render
 * HTML on the public site later.
 *
 * Note: we deliberately don't declare a global `Commands` module augmentation —
 * `@tiptap/core` is only present transitively (pnpm) and isn't resolvable as an
 * augmentation target here. The `setEmbed` command is invoked through a small
 * typed helper (`insertEmbed`) instead.
 */

import { Node, mergeAttributes, type Editor } from "@tiptap/react";

export interface EmbedOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Resolve a user-pasted URL to a provider embed URL. Returns null for
 * unsupported hosts (caller surfaces a "not supported" message).
 */
export function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  // YouTube — watch?v=, youtu.be/, /embed/, /shorts/
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop();
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }

  // Vimeo — vimeo.com/{id}
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }
  if (host === "player.vimeo.com") return u.toString();

  // Loom — loom.com/share/{id} -> loom.com/embed/{id}
  if (host === "loom.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    if (id) return `https://www.loom.com/embed/${id}`;
  }

  return null;
}

export const Embed = Node.create<EmbedOptions>({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "iframe[data-embed]" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "iframe",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-embed": "true",
        allowfullscreen: "true",
        frameborder: "0",
        loading: "lazy",
      }),
    ];
  },
});

/**
 * Insert an embed from a raw provider URL. Returns false (and inserts nothing)
 * when the URL host is unsupported.
 */
export function insertEmbed(editor: Editor, url: string): boolean {
  const src = toEmbedUrl(url);
  if (!src) return false;
  return editor
    .chain()
    .focus()
    .insertContent({ type: "embed", attrs: { src } })
    .run();
}
