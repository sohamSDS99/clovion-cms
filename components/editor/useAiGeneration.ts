"use client";

import { useCallback, useRef, useState } from "react";
import {
  createSseParser,
  type AiBrief,
  type AiMode,
  type SseDone,
} from "@/lib/editor/ai";
import type { ContentType } from "@/lib/ui/types";

/**
 * Client hook that drives a single AI generation run against the shared
 * `/api/ai/generate` SSE endpoint (FR-EDITOR-08, §6.1).
 *
 * It POSTs the brief, reads the streamed `text/event-stream` body with a
 * ReadableStream reader, parses `data: {json}` frames, and surfaces:
 *   - streamed tokens accumulated into `partialText` (rendered in the PREVIEW),
 *   - the terminal `result` (the finished Tiptap doc + metadata) on done,
 *   - a typed `error` ({code,message}) on failure.
 *
 * `stop()` aborts the in-flight fetch via an AbortController. Nothing here ever
 * touches the live document — insertion is an explicit, separate action.
 */

export type GenStatus = "idle" | "streaming" | "done" | "error" | "aborted";

export interface GenError {
  code: string;
  message: string;
}

export interface GenerateArgs {
  contentId?: string;
  contentType: ContentType;
  mode: AiMode;
  brief: AiBrief;
  kbTags?: string[];
}

export interface UseAiGeneration {
  status: GenStatus;
  partialText: string;
  result: SseDone | null;
  error: GenError | null;
  generate: (args: GenerateArgs) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useAiGeneration(): UseAiGeneration {
  const [status, setStatus] = useState<GenStatus>("idle");
  const [partialText, setPartialText] = useState("");
  const [result, setResult] = useState<SseDone | null>(null);
  const [error, setError] = useState<GenError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setPartialText("");
    setResult(null);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Mark aborted only if we were mid-stream (don't clobber a done/error).
    setStatus((s) => (s === "streaming" ? "aborted" : s));
  }, []);

  const generate = useCallback(async (args: GenerateArgs) => {
    // Tear down any previous run.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("streaming");
    setPartialText("");
    setResult(null);
    setError(null);

    let acc = "";
    const parser = createSseParser();

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          contentId: args.contentId,
          contentType: args.contentType,
          mode: args.mode,
          brief: args.brief,
          kbTags: args.kbTags && args.kbTags.length ? args.kbTags : undefined,
        }),
        signal: ctrl.signal,
      });

      // Non-2xx: the endpoint may return a JSON error envelope instead of a stream.
      if (!res.ok) {
        const env = await safeJson(res);
        const message =
          env?.error?.message ??
          env?.message ??
          `Request failed (${res.status}).`;
        const code = env?.error?.code ?? env?.code ?? "provider_error";
        setError({ code, message });
        setStatus("error");
        return;
      }

      if (!res.body) {
        setError({ code: "provider_error", message: "No response stream." });
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // Pump the stream. Each parsed event mutates local UI state.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const evt of parser.push(chunk)) {
          if (evt.type === "token") {
            acc += evt.text;
            setPartialText(acc);
          } else if (evt.type === "done") {
            setResult(evt);
            setStatus("done");
            return;
          } else if (evt.type === "error") {
            setError({ code: evt.code, message: evt.message });
            setStatus("error");
            return;
          }
        }
      }
      // Drain any trailing buffered frame.
      for (const evt of parser.flush()) {
        if (evt.type === "token") {
          acc += evt.text;
          setPartialText(acc);
        } else if (evt.type === "done") {
          setResult(evt);
          setStatus("done");
          return;
        } else if (evt.type === "error") {
          setError({ code: evt.code, message: evt.message });
          setStatus("error");
          return;
        }
      }

      // Stream ended without a terminal frame — treat as a soft error unless aborted.
      setStatus((s) => {
        if (s === "aborted") return s;
        setError({
          code: "provider_error",
          message: "The stream ended unexpectedly. Try again.",
        });
        return "error";
      });
    } catch (err) {
      if (ctrl.signal.aborted) {
        setStatus("aborted");
        return;
      }
      setError({
        code: "provider_error",
        message: err instanceof Error ? err.message : "Network error.",
      });
      setStatus("error");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, []);

  return { status, partialText, result, error, generate, stop, reset };
}

async function safeJson(
  res: Response
): Promise<{ error?: { message?: string; code?: string }; message?: string; code?: string } | null> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
