"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/ui/cn";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "@/components/media/MediaPicker";
import { toEmbedUrl, insertEmbed } from "@/lib/editor/config";

/**
 * Tiptap toolbar (FR-EDITOR-01/02/03). Buttons reflect active marks/nodes and
 * dispatch editor commands. Image insert pulls from the Media Library; embeds
 * accept a YouTube/Vimeo/Loom URL.
 */
export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  if (!editor) return null;

  const openLink = () => {
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
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

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t border-b border-line bg-paper-raised/95 px-2 py-1.5 backdrop-blur">
        <Select
          value={headingValue(editor)}
          onChange={(v) => {
            if (v === "p") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(v) as 2 | 3 | 4 })
                .run();
          }}
        />
        <Divider />
        <Btn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <span className="font-bold">B</span>
        </Btn>
        <Btn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span className="italic">I</span>
        </Btn>
        <Btn label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span className="underline">U</span>
        </Btn>
        <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span className="line-through">S</span>
        </Btn>
        <Btn label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <span className="font-mono text-xs">{"</>"}</span>
        </Btn>
        <Divider />
        <Btn label="Link" active={editor.isActive("link")} onClick={openLink}>
          <IconLink />
        </Btn>
        {editor.isActive("link") ? (
          <Btn label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
            <IconUnlink />
          </Btn>
        ) : null}
        <Divider />
        <Btn label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <IconBullet />
        </Btn>
        <Btn label="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <IconOrdered />
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
        <Btn label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <IconTable />
        </Btn>
        <Btn label="Insert image" onClick={() => setImageOpen(true)}>
          <IconImage />
        </Btn>
        <Btn label="Embed video" onClick={() => { setEmbedError(null); setEmbedOpen(true); }}>
          <IconVideo />
        </Btn>
        <Divider />
        <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <IconUndo />
        </Btn>
        <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <IconRedo />
        </Btn>
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
          error={embedError}
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

function headingValue(editor: Editor): string {
  if (editor.isActive("heading", { level: 2 })) return "2";
  if (editor.isActive("heading", { level: 3 })) return "3";
  if (editor.isActive("heading", { level: 4 })) return "4";
  return "p";
}

function Select({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label="Text style"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 cursor-pointer rounded-sm border border-line bg-transparent px-2 text-sm text-ink-soft hover:bg-paper-sunken focus:outline-none focus:ring-2 focus:ring-accent/25"
    >
      <option value="p">Paragraph</option>
      <option value="2">Heading 2</option>
      <option value="3">Heading 3</option>
      <option value="4">Heading 4</option>
    </select>
  );
}

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
        active
          ? "bg-accent-soft text-accent-ink"
          : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />;
}

/* Icons */
function I(props: React.SVGProps<SVGSVGElement>) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props} />;
}
function IconLink() { return <I><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></I>; }
function IconUnlink() { return <I><path d="m19 5-3 3M5 19l3-3" /><path d="M10 13a5 5 0 0 0 7 0M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 5 4.5" /></I>; }
function IconBullet() { return <I><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></I>; }
function IconOrdered() { return <I><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 14H4l2 3H4" /></I>; }
function IconQuote() { return <I><path d="M3 21c3 0 7-1 7-8V5H3v7h4M14 21c3 0 7-1 7-8V5h-7v7h4" /></I>; }
function IconCodeBlock() { return <I><path d="m16 18 4-6-4-6M8 6l-4 6 4 6M14 4l-4 16" /></I>; }
function IconTable() { return <I><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></I>; }
function IconImage() { return <I><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></I>; }
function IconVideo() { return <I><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m22 8-6 4 6 4z" /></I>; }
function IconUndo() { return <I><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></I>; }
function IconRedo() { return <I><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></I>; }
