import { describe, it, expect, vi } from "vitest";
import {
  createSseParser,
  parseSseData,
  parseFrame,
  aiErrorMessage,
  isRetryable,
  mergeAiDoc,
  defaultStrategy,
  docHasContent,
} from "@/lib/editor/ai";
import type { TiptapDoc } from "@/lib/ui/types";

describe("parseSseData", () => {
  it("parses a token event", () => {
    const e = parseSseData('{"type":"token","text":"Hello"}');
    expect(e).toEqual({ type: "token", text: "Hello" });
  });

  it("coerces a non-string token text to empty string", () => {
    const e = parseSseData('{"type":"token","text":123}');
    expect(e).toEqual({ type: "token", text: "" });
  });

  it("parses a done event with defaults filled in", () => {
    const e = parseSseData(
      '{"type":"done","jobId":"j1","tiptap":{"type":"doc","content":[]},"html":"<p>hi</p>","lowGrounding":true}'
    );
    expect(e).toMatchObject({
      type: "done",
      jobId: "j1",
      html: "<p>hi</p>",
      lowGrounding: true,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      sources: [],
    });
  });

  it("keeps usage and filters malformed sources on done", () => {
    const e = parseSseData(
      JSON.stringify({
        type: "done",
        jobId: "j2",
        tiptap: { type: "doc", content: [] },
        html: "",
        usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.01 },
        sources: [{ title: "A" }, { notitle: true }, null, { title: 2 }],
      })
    );
    expect(e).toMatchObject({
      usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.01 },
      sources: [{ title: "A" }],
    });
  });

  it("parses an error event with a default code", () => {
    const e = parseSseData('{"type":"error","message":"boom"}');
    expect(e).toEqual({ type: "error", message: "boom", code: "provider_error" });
  });

  it("returns null for unknown types and reports invalid JSON", () => {
    expect(parseSseData('{"type":"mystery"}')).toBeNull();
    const onErr = vi.fn();
    expect(parseSseData("{not json", onErr)).toBeNull();
    expect(onErr).toHaveBeenCalledOnce();
  });
});

describe("parseFrame", () => {
  it("concatenates multiple data lines and strips a leading space", () => {
    const e = parseFrame('data: {"type":"token",\ndata: "text":"hi"}');
    expect(e).toEqual({ type: "token", text: "hi" });
  });

  it("ignores comment/heartbeat lines and [DONE]", () => {
    expect(parseFrame(": keep-alive")).toBeNull();
    expect(parseFrame("data: [DONE]")).toBeNull();
  });
});

describe("createSseParser", () => {
  it("emits one event per frame across arbitrary chunk boundaries", () => {
    const parser = createSseParser();
    const events = [];
    // A token frame split mid-JSON across three pushes, then a done frame.
    events.push(...parser.push('data: {"type":"to'));
    events.push(...parser.push('ken","text":"A"}\n\n'));
    events.push(...parser.push('data: {"type":"token","text":"B"}\n\ndata: {"ty'));
    events.push(...parser.push('pe":"token","text":"C"}\n\n'));
    expect(events).toEqual([
      { type: "token", text: "A" },
      { type: "token", text: "B" },
      { type: "token", text: "C" },
    ]);
  });

  it("handles CRLF frame separators", () => {
    const parser = createSseParser();
    const events = parser.push(
      'data: {"type":"token","text":"X"}\r\n\r\ndata: {"type":"token","text":"Y"}\r\n\r\n'
    );
    expect(events).toEqual([
      { type: "token", text: "X" },
      { type: "token", text: "Y" },
    ]);
  });

  it("flush() emits a trailing frame without a terminating blank line", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"token","text":"tail"}')).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "token", text: "tail" }]);
  });

  it("skips malformed frames but keeps streaming subsequent ones", () => {
    const onErr = vi.fn();
    const parser = createSseParser(onErr);
    const events = parser.push(
      'data: {bad json}\n\ndata: {"type":"token","text":"ok"}\n\n'
    );
    expect(events).toEqual([{ type: "token", text: "ok" }]);
    expect(onErr).toHaveBeenCalledOnce();
  });
});

describe("aiErrorMessage / isRetryable", () => {
  it("maps known codes to remediation copy", () => {
    expect(aiErrorMessage("ai_not_configured", "")).toMatch(/Settings/);
    expect(aiErrorMessage("budget_exceeded", "Over budget!")).toBe("Over budget!");
    expect(aiErrorMessage("provider_error", "")).toMatch(/try again/i);
    expect(aiErrorMessage("weird", "fallback msg")).toBe("fallback msg");
  });

  it("only provider_error is retryable", () => {
    expect(isRetryable("provider_error")).toBe(true);
    expect(isRetryable("budget_exceeded")).toBe(false);
    expect(isRetryable("ai_not_configured")).toBe(false);
  });
});

describe("mergeAiDoc", () => {
  const current: TiptapDoc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "old" }] }],
  };
  const generated: TiptapDoc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }],
  };

  it("replace returns only generated nodes", () => {
    const out = mergeAiDoc(current, generated, "replace");
    expect(out).toEqual({ type: "doc", content: generated.content });
  });

  it("append concatenates without mutating inputs", () => {
    const out = mergeAiDoc(current, generated, "append") as {
      content: unknown[];
    };
    expect(out.content).toHaveLength(2);
    expect((current.content as unknown[]).length).toBe(1); // unchanged
  });
});

describe("defaultStrategy / docHasContent", () => {
  it("section appends, others replace", () => {
    expect(defaultStrategy("section")).toBe("append");
    expect(defaultStrategy("full_draft")).toBe("replace");
    expect(defaultStrategy("outline")).toBe("replace");
    expect(defaultStrategy("rewrite")).toBe("replace");
  });

  it("docHasContent detects empty vs populated docs", () => {
    expect(docHasContent({ type: "doc", content: [] })).toBe(false);
    expect(docHasContent(null)).toBe(false);
    expect(docHasContent({ type: "doc", content: [{ type: "paragraph" }] })).toBe(
      true
    );
  });
});
