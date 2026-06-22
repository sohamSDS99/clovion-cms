/**
 * Pure, framework-free helpers for the in-editor AI Write feature
 * (FR-EDITOR-08, §6.1). Kept DOM/React-free so they are unit-testable
 * (see lib/editor/__tests__/ai.test.ts) and importable by client components.
 *
 * The streaming contract (shared with the backend `/api/ai/generate`) is
 * Server-Sent Events: each message is `data: <json>\n\n`, where <json> is one
 * of the union members below. We never auto-publish; AI output is draft-only.
 */

import type { TiptapDoc } from "@/lib/ui/types";

/** The four generation modes exposed in the panel. */
export type AiMode = "full_draft" | "section" | "rewrite" | "outline";

/** The structured brief the user fills in before generating. */
export interface AiBrief {
  topic?: string;
  keywords?: string[];
  outline?: string;
  sectionName?: string;
  selectedText?: string;
  lengthTarget?: string;
}

/** A single source citation surfaced from the knowledge base. */
export interface AiSource {
  title: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

/** Incremental model output. */
export interface SseToken {
  type: "token";
  text: string;
}

/** Terminal success message carrying the finished draft. */
export interface SseDone {
  type: "done";
  jobId: string;
  tiptap: TiptapDoc;
  html: string;
  lowGrounding: boolean;
  usage: AiUsage;
  sources: AiSource[];
}

/** Terminal error message. `code` lets the UI branch on remediation. */
export interface SseError {
  type: "error";
  message: string;
  code: string;
}

export type SseEvent = SseToken | SseDone | SseError;

/** Known error codes from the generation endpoint. */
export type AiErrorCode =
  | "ai_not_configured"
  | "budget_exceeded"
  | "provider_error"
  | string;

/**
 * Stateful, allocation-light SSE frame splitter.
 *
 * Feed it arbitrary chunk strings as they arrive off the network (chunk
 * boundaries do NOT align with SSE frame boundaries). It buffers the tail and
 * emits one parsed `SseEvent` per complete `data:` line in a `\n\n`-delimited
 * frame. Malformed JSON lines are skipped (returned via `onParseError` if
 * provided) rather than throwing, so a single bad frame never kills the stream.
 *
 * Usage:
 *   const parser = createSseParser();
 *   for await (const chunk of stream) {
 *     for (const evt of parser.push(chunk)) handle(evt);
 *   }
 *   for (const evt of parser.flush()) handle(evt); // trailing frame, if any
 */
export interface SseParser {
  push(chunk: string): SseEvent[];
  flush(): SseEvent[];
}

export function createSseParser(
  onParseError?: (line: string, err: unknown) => void
): SseParser {
  let buffer = "";

  function drain(force: boolean): SseEvent[] {
    const events: SseEvent[] = [];
    // SSE frames are separated by a blank line (\n\n). We also tolerate \r\n\r\n.
    let sep: number;
    while ((sep = indexOfFrameBreak(buffer)) !== -1) {
      const frame = buffer.slice(0, sep.valueOf());
      // Advance past the matched separator (handle both \n\n and \r\n\r\n).
      buffer = buffer.slice(advancePast(buffer, sep));
      const evt = parseFrame(frame, onParseError);
      if (evt) events.push(evt);
    }
    if (force && buffer.trim().length > 0) {
      const evt = parseFrame(buffer, onParseError);
      if (evt) events.push(evt);
      buffer = "";
    }
    return events;
  }

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      return drain(false);
    },
    flush(): SseEvent[] {
      return drain(true);
    },
  };
}

/** Index of the start of a frame separator (\n\n or \r\n\r\n), or -1. */
function indexOfFrameBreak(s: string): number {
  const lf = s.indexOf("\n\n");
  const crlf = s.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

/** Chars to skip after the separator found at `idx`. */
function advancePast(s: string, idx: number): number {
  if (s.startsWith("\r\n\r\n", idx)) return idx + 4;
  return idx + 2;
}

/**
 * Parse a single SSE frame (one or more lines) into an event. A frame may carry
 * multiple `data:` lines per spec; we concatenate them. Comment lines (`:`) and
 * non-data fields are ignored. Returns null when there is no usable payload.
 */
export function parseFrame(
  frame: string,
  onParseError?: (line: string, err: unknown) => void
): SseEvent | null {
  const dataParts: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith(":")) continue; // comment / heartbeat
    if (line.startsWith("data:")) {
      dataParts.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataParts.length === 0) return null;
  const payload = dataParts.join("\n").trim();
  if (!payload || payload === "[DONE]") return null;
  return parseSseData(payload, onParseError);
}

/**
 * Parse the JSON payload of a single SSE `data:` value into a typed event.
 * Validates the discriminant; unknown/invalid payloads return null (and are
 * reported via onParseError) so the consumer can keep streaming.
 */
export function parseSseData(
  payload: string,
  onParseError?: (line: string, err: unknown) => void
): SseEvent | null {
  let obj: unknown;
  try {
    obj = JSON.parse(payload);
  } catch (err) {
    onParseError?.(payload, err);
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const type = (obj as { type?: unknown }).type;
  if (type === "token") {
    const text = (obj as { text?: unknown }).text;
    return { type: "token", text: typeof text === "string" ? text : "" };
  }
  if (type === "done") {
    const o = obj as Partial<SseDone>;
    return {
      type: "done",
      jobId: typeof o.jobId === "string" ? o.jobId : "",
      tiptap: (o.tiptap ?? { type: "doc", content: [] }) as TiptapDoc,
      html: typeof o.html === "string" ? o.html : "",
      lowGrounding: Boolean(o.lowGrounding),
      usage:
        o.usage && typeof o.usage === "object"
          ? {
              promptTokens: Number(o.usage.promptTokens ?? 0),
              completionTokens: Number(o.usage.completionTokens ?? 0),
              costUsd: Number(o.usage.costUsd ?? 0),
            }
          : { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      sources: Array.isArray(o.sources)
        ? o.sources
            .filter((s): s is AiSource => !!s && typeof s.title === "string")
            .map((s) => ({ title: s.title }))
        : [],
    };
  }
  if (type === "error") {
    const o = obj as Partial<SseError>;
    return {
      type: "error",
      message: typeof o.message === "string" ? o.message : "Generation failed.",
      code: typeof o.code === "string" ? o.code : "provider_error",
    };
  }
  return null;
}

/** Map a known AI error code to a user-facing remediation message. */
export function aiErrorMessage(code: AiErrorCode, fallback: string): string {
  switch (code) {
    case "ai_not_configured":
      return "Connect OpenRouter in Settings first.";
    case "budget_exceeded":
      return (
        fallback ||
        "The monthly AI budget has been reached. Adjust it in Settings to continue."
      );
    case "provider_error":
      return fallback || "The AI provider hit an error. Try again.";
    default:
      return fallback || "Generation failed.";
  }
}

/** True when a code should offer a retry affordance. */
export function isRetryable(code: AiErrorCode): boolean {
  return code === "provider_error";
}

/** True when a Tiptap doc has at least one content node. */
export function docHasContent(doc: TiptapDoc | null | undefined): boolean {
  if (!doc || typeof doc !== "object") return false;
  const content = (doc as { content?: unknown[] }).content;
  return Array.isArray(content) && content.length > 0;
}

/**
 * Merge an AI-generated Tiptap doc into the existing document according to the
 * chosen insert strategy. Pure and immutable — returns a NEW doc; never mutates
 * inputs. The caller decides the strategy via the panel's Insert/Replace UI.
 *
 *  - "replace": the generated doc becomes the whole document.
 *  - "append" : generated nodes are appended after existing content.
 *
 * Selection-level replacement (rewrite mode) is handled in the editor via
 * ProseMirror commands, not here.
 */
export function mergeAiDoc(
  current: TiptapDoc,
  generated: TiptapDoc,
  strategy: "append" | "replace"
): TiptapDoc {
  const genNodes = nodesOf(generated);
  if (strategy === "replace") {
    return { type: "doc", content: genNodes };
  }
  const curNodes = nodesOf(current);
  return { type: "doc", content: [...curNodes, ...genNodes] };
}

function nodesOf(doc: TiptapDoc): unknown[] {
  const content = (doc as { content?: unknown[] }).content;
  return Array.isArray(content) ? content : [];
}

/**
 * Default insert strategy per mode. full_draft/outline default to replacing the
 * (typically empty) doc; section appends; rewrite replaces the selection.
 */
export function defaultStrategy(mode: AiMode): "append" | "replace" {
  return mode === "section" ? "append" : "replace";
}
