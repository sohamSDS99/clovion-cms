"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "@/components/media/MediaPicker";
import { toEmbedUrl, insertEmbed } from "@/lib/editor/config";
import { FONT_FAMILIES, FONT_SIZES } from "@/lib/editor/fontExtensions";

/**
 * Tiptap toolbar (FR-EDITOR-01/02/03). Two rows of controls reflecting the
 * active marks/nodes: row 1 — history, block style, headings, inline marks,
 * highlight/colour, alignment; row 2 — lists, quote/code/rule, links, media,
 * table, and a ⋯ more menu. Image insert pulls from the Media Library; embeds
 * accept a YouTube/Vimeo/Loom URL.
 */
export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!editor) return null;

  const openLink = () => {
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  };

  const applyEmbed = () => {
    const ok = insertEmbed(editor, embedUrl.trim());
    if (!ok) {
      setEmbedError("Unsupported URL. Use a YouTube, Vimeo, or Loom link.");
      return;
    }
    setEmbedUrl("");
    setEmbedError(null);
    setEmbedOpen(false);
  };

  const currentColor = (editor.getAttributes("textStyle").color as string) || "";

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-1 rounded-t bg-paper-raised/95 px-2 py-1.5 backdrop-blur">
        {/* ── Row 1 ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-0.5">
          <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            <IconUndo />
          </Btn>
          <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            <IconRedo />
          </Btn>
          <Divider />

          {/* Labelled dropdowns so it's clear which controls headings, font
              family, and font size. The heading menu replaces the old H1/H2/H3
              buttons and exposes all six levels. */}
          <ToolbarField label="Headings"><BlockSelect editor={editor} /></ToolbarField>
          <ToolbarField label="Font"><FontFamilySelect editor={editor} /></ToolbarField>
          <ToolbarField label="Size"><FontSizeSelect editor={editor} /></ToolbarField>
          <Divider />

          <Btn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <span className="font-bold">B</span>
          </Btn>
          <Btn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="italic font-serif">I</span>
          </Btn>
          <Btn label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span className="underline">U</span>
          </Btn>
          <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <span className="line-through">S</span>
          </Btn>
          <Divider />

          <Btn label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <span className="font-mono text-xs">{"</>"}</span>
          </Btn>
          <Btn label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <IconHighlight />
          </Btn>

          {/* Text colour */}
          <div className="relative">
            <button
              type="button"
              title="Text colour"
              aria-label="Text colour"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColorOpen((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-sm text-ink-soft transition-colors hover:bg-paper-sunken"
            >
              <span
                className="h-4 w-4 rounded-[3px] border border-line-strong"
                style={{ background: currentColor || "var(--ink)" }}
              />
            </button>
            {colorOpen ? (
              <ColorMenu
                current={currentColor}
                onPick={(c) => {
                  if (c) editor.chain().focus().setColor(c).run();
                  else editor.chain().focus().unsetColor().run();
                  setColorOpen(false);
                }}
                onClose={() => setColorOpen(false)}
              />
            ) : null}
          </div>
        </div>

        {/* ── Row 2 ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-0.5">
          <Btn label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <IconAlignLeft />
          </Btn>
          <Btn label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <IconAlignCenter />
          </Btn>
          <Btn label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <IconAlignRight />
          </Btn>
          <Btn label="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
            <IconAlignJustify />
          </Btn>
          <Divider />

          <Btn label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <IconBullet />
          </Btn>
          <Btn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <IconOrdered />
          </Btn>
          <Btn label="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <IconTask />
          </Btn>
          <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <IconQuote />
          </Btn>
          <Btn label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <IconCodeBlock />
          </Btn>
          <Btn label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <span className="text-xs">—</span>
          </Btn>
          <Divider />

          <Btn label="Link" active={editor.isActive("link")} onClick={openLink}>
            <IconLink />
          </Btn>
          <Btn label="Remove link" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}>
            <IconUnlink />
          </Btn>
          <Btn label="Insert image" onClick={() => setImageOpen(true)}>
            <IconImage />
          </Btn>
          <Btn label="Embed video" onClick={() => { setEmbedError(null); setEmbedOpen(true); }}>
            <IconVideo />
          </Btn>
          <Btn label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <IconTable />
          </Btn>
          <Divider />

          {/* More menu */}
          <div className="relative">
            <Btn label="More" active={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              <IconMore />
            </Btn>
            {moreOpen ? (
              <Popover onClose={() => setMoreOpen(false)}>
                <MenuItem onClick={() => { editor.chain().focus().unsetAllMarks().clearNodes().run(); setMoreOpen(false); }}>
                  Clear formatting
                </MenuItem>
                <MenuItem onClick={() => { editor.chain().focus().setHardBreak().run(); setMoreOpen(false); }}>
                  Line break
                </MenuItem>
              </Popover>
            ) : null}
          </div>
        </div>
      </div>

      {/* Link dialog */}
      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Add link"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyLink}>Apply</Button>
          </>
        }
      >
        <Input
          label="URL"
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyLink()}
          autoFocus
        />
        <p className="mt-2 text-xs text-ink-mute">
          Leave empty and apply to remove an existing link.
        </p>
      </Modal>

      {/* Embed dialog (FR-EDITOR-03) */}
      <Modal
        open={embedOpen}
        onClose={() => setEmbedOpen(false)}
        title="Embed video"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEmbedOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyEmbed}>Embed</Button>
          </>
        }
      >
        <Input
          label="Video URL"
          placeholder="https://youtube.com/watch?v=…"
          value={embedUrl}
          onChange={(e) => { setEmbedUrl(e.target.value); setEmbedError(null); }}
          onKeyDown={(e) => e.key === "Enter" && applyEmbed()}
          error={embedError ?? undefined}
          autoFocus
        />
        <p className="mt-2 text-xs text-ink-mute">
          Supports YouTube, Vimeo, and Loom.
          {embedUrl && toEmbedUrl(embedUrl) ? " URL recognised ✓" : ""}
        </p>
      </Modal>

      {/* Inline image picker (FR-EDITOR-02) */}
      <MediaPicker
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        kind="IMAGE"
        title="Insert image"
        onPick={(asset) =>
          editor
            .chain()
            .focus()
            .setImage({ src: asset.variants?.lg ?? asset.url, alt: asset.altText ?? "" })
            .run()
        }
      />
    </>
  );
}

/* ── Shared dropdown styling + labelled wrapper (UI consistency) ─────────── */
// Borderless: the ToolbarField box below provides the frame, so the whole
// control (faint title + value) reads as one tidy boxed unit.
const SELECT_CLASS =
  "h-7 cursor-pointer rounded-sm bg-transparent pl-1 pr-0.5 text-sm text-ink-soft focus:outline-none";

/**
 * A toolbar dropdown wrapped in a single bordered box with a low-opacity title
 * *inside* the box (e.g. "HEADINGS Paragraph ▾"), instead of a separate label
 * floating beside it — keeps the toolbar clean and self-explanatory.
 */
function ToolbarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex h-8 items-center gap-1 rounded-md border border-line bg-paper pl-2 pr-0.5 transition-colors hover:bg-paper-sunken focus-within:ring-2 focus-within:ring-accent/25">
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-ink-faint/70">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ── Block-style dropdown (Paragraph / Heading 1–6) ─────────────────────── */
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
function BlockSelect({ editor }: { editor: Editor }) {
  const active = HEADING_LEVELS.find((l) => editor.isActive("heading", { level: l }));
  const value = active ? String(active) : "p";
  return (
    <select
      aria-label="Paragraph style"
      title="Paragraph style"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "p") editor.chain().focus().setParagraph().run();
        else
          editor
            .chain()
            .focus()
            .toggleHeading({ level: Number(v) as (typeof HEADING_LEVELS)[number] })
            .run();
      }}
      className={`${SELECT_CLASS} w-28`}
    >
      <option value="p">Paragraph</option>
      {HEADING_LEVELS.map((l) => (
        <option key={l} value={l}>
          Heading {l}
        </option>
      ))}
    </select>
  );
}

/* ── Font family dropdown ───────────────────────────────────────────────── */
function FontFamilySelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontFamily as string) || "";
  return (
    <select
      aria-label="Font"
      title="Font"
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        if (v) editor.chain().focus().setMark("textStyle", { fontFamily: v }).run();
        else editor.chain().focus().setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run();
      }}
      style={current ? { fontFamily: current } : undefined}
      className={`${SELECT_CLASS} w-24 truncate`}
    >
      {FONT_FAMILIES.map((f) => (
        <option key={f.value || "default"} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/* ── Font size dropdown ─────────────────────────────────────────────────── */
function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontSize as string) || "";
  return (
    <select
      aria-label="Font size"
      title="Font size"
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        if (v) editor.chain().focus().setMark("textStyle", { fontSize: v }).run();
        else editor.chain().focus().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
      }}
      className={`${SELECT_CLASS} w-[4.5rem]`}
    >
      {FONT_SIZES.map((s) => (
        <option key={s.value || "default"} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/* ── Colour menu ────────────────────────────────────────────────────────── */
const COLORS = [
  { label: "Default", value: "" },
  { label: "Emerald", value: "#1f6b53" },
  { label: "Blue", value: "#2563a8" },
  { label: "Red", value: "#b42318" },
  { label: "Amber", value: "#d97706" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Grey", value: "#71717a" },
];
function ColorMenu({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (c: string) => void;
  onClose: () => void;
}) {
  return (
    <Popover onClose={onClose}>
      <div className="grid grid-cols-4 gap-1.5 p-1">
        {COLORS.map((c) => (
          <button
            key={c.value || "default"}
            type="button"
            title={c.label}
            aria-label={c.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c.value)}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md border",
              (current || "") === c.value ? "border-ink" : "border-line"
            )}
          >
            <span
              className="h-4 w-4 rounded-[3px]"
              style={{ background: c.value || "var(--ink)" }}
            />
          </button>
        ))}
      </div>
    </Popover>
  );
}

/* ── Popover (click-outside) ────────────────────────────────────────────── */
function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-1 min-w-[8rem] rounded-md border border-line bg-paper-raised p-1 shadow-pop"
    >
      {children}
    </div>
  );
}
function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="block w-full rounded-sm px-2.5 py-1.5 text-left text-sm text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ── Button + divider ───────────────────────────────────────────────────── */
function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-sm text-sm transition-colors disabled:opacity-40",
        active ? "bg-accent-soft text-accent-ink" : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />;
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function I(props: React.SVGProps<SVGSVGElement>) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props} />;
}
function IconLink() { return <I><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></I>; }
function IconUnlink() { return <I><path d="m19 5-3 3M5 19l3-3" /><path d="M10 13a5 5 0 0 0 7 0M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 5 4.5" /></I>; }
function IconBullet() { return <I><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></I>; }
function IconOrdered() { return <I><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 14H4l2 3H4" /></I>; }
function IconTask() { return <I><path d="M3 5h7M3 12h7M3 19h7" /><path d="m14 6 2 2 4-4M14 17l2 2 4-4" /></I>; }
function IconQuote() { return <I><path d="M3 21c3 0 7-1 7-8V5H3v7h4M14 21c3 0 7-1 7-8V5h-7v7h4" /></I>; }
function IconCodeBlock() { return <I><path d="m16 18 4-6-4-6M8 6l-4 6 4 6M14 4l-4 16" /></I>; }
function IconTable() { return <I><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></I>; }
function IconImage() { return <I><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></I>; }
function IconVideo() { return <I><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m22 8-6 4 6 4z" /></I>; }
function IconUndo() { return <I><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></I>; }
function IconRedo() { return <I><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></I>; }
function IconHighlight() { return <I><path d="m9 11 6-6 4 4-6 6" /><path d="M9 11 4 16v4h4l5-5" /><path d="M3 21h7" /></I>; }
function IconAlignLeft() { return <I><path d="M4 6h16M4 12h10M4 18h13" /></I>; }
function IconAlignCenter() { return <I><path d="M4 6h16M7 12h10M5 18h14" /></I>; }
function IconAlignRight() { return <I><path d="M4 6h16M10 12h10M7 18h13" /></I>; }
function IconAlignJustify() { return <I><path d="M4 6h16M4 12h16M4 18h16" /></I>; }
function IconMore() { return <I><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></I>; }
