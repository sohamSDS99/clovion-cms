/**
 * Shared Tiptap extension set (FR-EDITOR-01..03).
 *
 * This is the single source of truth for the editable document schema. It is
 * deliberately framework-agnostic (no React) so it can be reused to render the
 * stored Tiptap JSON to HTML on the public site (e.g. via @tiptap/html
 * `generateHTML(doc, editorExtensions)`).
 *
 * Heading levels are constrained to H2–H4 — the H1 is the content title, not a
 * body node. StarterKit (Tiptap v2) bundles paragraph/bold/italic/strike/code/
 * headings/lists/blockquote/hr/codeBlock/history; Underline, Link, Image, Table
 * and the custom Embed node are layered on.
 */

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import type { Extensions } from "@tiptap/react";
import { Embed } from "./embed";

/** An empty Tiptap document (matches the server's EMPTY_DOC). */
export const EMPTY_DOC = { type: "doc", content: [] } as const;

/**
 * The canonical extension list. Shared between the live editor and any
 * server/HTML rendering path.
 */
export const editorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
  }),
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ["http", "https", "mailto", "tel"],
    HTMLAttributes: {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    },
  }),
  Image.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: { loading: "lazy" },
  }),
  Table.configure({ resizable: true, HTMLAttributes: { class: "clv-table" } }),
  TableRow,
  TableHeader,
  TableCell,
  Embed,
];

export { Embed, toEmbedUrl, insertEmbed } from "./embed";
