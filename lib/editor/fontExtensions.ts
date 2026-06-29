/**
 * Font family + font size marks for the shared Tiptap editor (FR-EDITOR-01).
 *
 * Both are thin extensions layered on TextStyle: they register a global
 * attribute on the `textStyle` mark and render it as an inline `style` on the
 * emitted <span>. Kept framework-agnostic in spirit (no React component code) so
 * the SAME extensions parse the stored JSON on the public render path
 * (lib/public/render) — otherwise the marks would be silently dropped and the
 * chosen font would never reach the site. We hand-roll these (instead of adding
 * @tiptap/extension-font-family) so family + size share one tiny file and we add
 * no new dependency; `Extension` comes from @tiptap/react, the same re-export the
 * existing custom Embed node uses.
 *
 * No custom commands are declared — callers apply the marks with the built-in
 * `setMark("textStyle", …)` / `removeEmptyTextStyle()` commands, which keeps us
 * clear of module augmentation. Security: each attribute only emits a single,
 * well-known CSS property (font-family / font-size) with the author-chosen
 * value — no arbitrary style pass-through.
 */

import { Extension } from "@tiptap/react";

export const FontFamily = Extension.create({
  name: "fontFamily",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types as string[],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) =>
              element.style.fontFamily?.replace(/['"]/g, "") || null,
            renderHTML: (attributes) =>
              attributes.fontFamily
                ? { style: `font-family: ${attributes.fontFamily}` }
                : {},
          },
        },
      },
    ];
  },
});

export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types as string[],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) =>
              attributes.fontSize
                ? { style: `font-size: ${attributes.fontSize}` }
                : {},
          },
        },
      },
    ];
  },
});

/**
 * Curated font-family options for the toolbar. Saans is the brand/official face
 * and the editor default (the empty value clears the mark and inherits it); the
 * rest are common SaaS UI typefaces. Each value is a full CSS font stack so the
 * choice degrades gracefully when a face isn't installed.
 */
export const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Saans (default)", value: "" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "Lato, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Work Sans", value: "'Work Sans', sans-serif" },
  { label: "Nunito Sans", value: "'Nunito Sans', sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, serif" },
  { label: "System UI", value: "system-ui, sans-serif" },
];

/** Curated font-size options (CSS lengths). The empty value clears the mark. */
export const FONT_SIZES: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "30", value: "30px" },
  { label: "36", value: "36px" },
  { label: "48", value: "48px" },
];
