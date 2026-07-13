/**
 * Course batch generation — from an approved outline run to a full course:
 * syllabus extraction → sequential lesson runs (each fed the outline + all
 * prior lessons) → downloadable template assets (docx/xlsx) per lesson.
 *
 * Approval-gated: only an APPROVED outline can start a batch (the human gate
 * sits where it has the most leverage). Resumable: re-triggering a FAILED
 * batch continues after the last finished lesson.
 */
import { Prisma } from "@prisma/client";
import type { AgentRun, CourseBatch } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import {
  getConfig,
  getDecryptedAnthropicKey,
  getDecryptedOpenaiKey,
} from "@/lib/ai/config";
import type { ProviderKeys } from "@/lib/ai/providers";
import { createAssetFromUpload } from "@/lib/media/service";
import { executeRun, callRole, resolveAgentModels } from "./pipeline";
import { slugify } from "@/lib/content/slug";
import { humanizeFilename } from "./courseHtml";
import {
  parseJsonOutput,
  syllabusMessages,
  MAX_LESSONS,
  type Syllabus,
  type SyllabusAsset,
  type SyllabusLesson,
} from "./prompts";
export type { Syllabus, SyllabusAsset, SyllabusLesson };
import {
  renderDocx,
  renderXlsx,
  DOCX_MIME,
  XLSX_MIME,
  type DocxSpec,
  type XlsxSpec,
} from "./render";
import type { ChatMessage } from "@/lib/ai/openrouter";



const PRIOR_LESSON_CHARS = 9000;

async function loadKeysAndModels() {
  const config = await getConfig();
  const keys: ProviderKeys = {
    anthropic: await getDecryptedAnthropicKey(),
    openai: await getDecryptedOpenaiKey(),
  };
  const models = resolveAgentModels(
    (config as unknown as { agentModels?: unknown }).agentModels
  );
  return { keys, models };
}



function assetMessages(
  courseTitle: string,
  lessonTitle: string,
  lessonDraft: string,
  asset: SyllabusAsset
): ChatMessage[] {
  const contract =
    asset.kind === "docx"
      ? `{"filename": "kebab-case-name.docx", "docx": {"title": "…", "intro": "one short paragraph on how to use this", "sections": [{"heading": "…", "paragraphs": ["…"], "bullets": ["…"], "table": {"headers": ["…"], "rows": [["…"]]}}]}}`
      : `{"filename": "kebab-case-name.xlsx", "xlsx": {"sheets": [{"name": "…", "headers": ["…"], "rows": [["…"]], "widths": [30, 20]}]}}`;
  return [
    {
      role: "system",
      content: `You produce the CONTENT of a downloadable ${asset.kind} template that accompanies a course lesson. It must be immediately usable: real column headers, realistic example rows (marked as examples), clear instructions. Calm, plain-English microcopy — no hype. Respond with STRICT JSON only (no code fences) in exactly this shape:\n${contract}`,
    },
    {
      role: "user",
      content: `COURSE: ${courseTitle}\nLESSON: ${lessonTitle}\n\nASSET TO CREATE: ${asset.name}\nWHAT IT'S FOR: ${asset.description}\n\nLESSON CONTENT (align the template with this):\n${lessonDraft.slice(0, 6000)}`,
    },
  ];
}

/** Start (or resume) a course batch for an approved outline run. */
export async function startCourseBatch(
  user: SessionUser,
  outlineRunId: string
): Promise<CourseBatch> {
  const outline = await prisma.agentRun.findUnique({ where: { id: outlineRunId } });
  if (!outline) throw new NotFoundError("Outline run not found.");
  if (outline.postType !== "course-outline") {
    throw new BadRequestError("Course generation starts from a course-outline run.");
  }
  if (outline.status !== "READY" || !outline.draftText) {
    throw new ConflictError("The outline must finish generating first.");
  }
  if (!outline.approvedAt) {
    throw new ConflictError(
      "Approve the outline first — every lesson inherits it, so this is the gate that matters."
    );
  }

  let batch = await prisma.courseBatch.findUnique({ where: { outlineRunId } });
  if (batch && (batch.status === "RUNNING" || batch.status === "PLANNING")) {
    throw new ConflictError("This course is already generating.");
  }
  if (batch && batch.status === "READY") {
    throw new ConflictError("This course has already been generated.");
  }
  if (batch) {
    batch = await prisma.courseBatch.update({
      where: { id: batch.id },
      data: { status: "PLANNING", error: Prisma.DbNull },
    });
  } else {
    batch = await prisma.courseBatch.create({
      data: { outlineRunId, createdById: user.id },
    });
  }

  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: outlineRunId,
    action: "course_batch_started",
  });
  void executeCourseBatch(batch.id);
  return batch;
}

export async function getCourseBatch(outlineRunId: string) {
  const batch = await prisma.courseBatch.findUnique({ where: { outlineRunId } });
  if (!batch) return null;
  const ids = (batch.lessonRunIds as string[]) ?? [];
  const runs = ids.length
    ? await prisma.agentRun.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, brief: true, approvedAt: true, contentId: true },
      })
    : [];
  const assetRows = ids.length
    ? await prisma.agentAsset.findMany({
        where: { runId: { in: ids } },
        select: { runId: true, status: true },
      })
    : [];
  const assetSummary = { ready: 0, generating: 0, failed: 0 };
  for (const a of assetRows) {
    if (a.status === "READY") assetSummary.ready += 1;
    else if (a.status === "FAILED") assetSummary.failed += 1;
    else assetSummary.generating += 1;
  }
  const ordered = ids
    .map((id) => runs.find((r) => r.id === id))
    .filter(Boolean);
  return { batch, lessons: ordered, assetSummary };
}

/** The batch executor. Idempotent via PLANNING→RUNNING claim. */
export async function executeCourseBatch(batchId: string): Promise<void> {
  const claim = await prisma.courseBatch.updateMany({
    where: { id: batchId, status: "PLANNING" },
    data: { status: "RUNNING" },
  });
  if (claim.count === 0) return;

  const batch = await prisma.courseBatch.findUnique({ where: { id: batchId } });
  if (!batch) return;
  const outline = await prisma.agentRun.findUnique({
    where: { id: batch.outlineRunId },
  });
  if (!outline?.draftText) return;

  try {
    const { keys, models } = await loadKeysAndModels();

    // 1 — Syllabus: prefer the user-edited lesson plan from the outline run;
    // fall back to fresh extraction (older outlines).
    let syllabus = batch.syllabus as unknown as Syllabus | null;
    if (!syllabus && outline.outlineSyllabus) {
      const edited = outline.outlineSyllabus as unknown as Syllabus;
      syllabus = {
        courseTitle: edited.courseTitle,
        lessons: (edited.lessons ?? [])
          .filter((l) => l.title?.trim())
          .slice(0, MAX_LESSONS)
          .map((l, i) => ({ ...l, n: i + 1 })),
      };
      await prisma.courseBatch.update({
        where: { id: batchId },
        data: {
          syllabus: syllabus as unknown as Prisma.InputJsonValue,
          courseTitle: syllabus.courseTitle ?? null,
        },
      });
    }
    if (!syllabus) {
      const res = await callRole(keys, models.orchestrator, syllabusMessages(outline), 8000);
      syllabus = parseJsonOutput<Syllabus>(res.text);
      syllabus.lessons = (syllabus.lessons ?? []).slice(0, MAX_LESSONS);
      await prisma.courseBatch.update({
        where: { id: batchId },
        data: {
          syllabus: syllabus as unknown as Prisma.InputJsonValue,
          courseTitle: syllabus.courseTitle ?? null,
        },
      });
    }

    const lessonRunIds: string[] = [
      ...(((batch.lessonRunIds as string[]) ?? []) as string[]),
    ];

    // 2 — Lessons, sequential, resumable.
    for (let i = batch.currentLesson; i < syllabus.lessons.length; i++) {
      const lesson = syllabus.lessons[i];

      // Compose source: outline + every finished prior lesson (trimmed).
      const priorRuns = lessonRunIds.length
        ? await prisma.agentRun.findMany({
            where: { id: { in: lessonRunIds } },
            select: { brief: true, draftText: true },
            orderBy: { createdAt: "asc" },
          })
        : [];
      const priors = priorRuns
        .map(
          (r, j) =>
            `--- LESSON ${j + 1} (already published, do not re-teach) ---\n${(r.draftText ?? "").slice(0, PRIOR_LESSON_CHARS)}`
        )
        .join("\n\n");
      const sourceReport = `--- APPROVED COURSE OUTLINE ---\n${outline.draftText}${priors ? `\n\n${priors}` : ""}`;

      const run = await prisma.agentRun.create({
        data: {
          channel: "BLOG_ARTICLE",
          postType: "course-lesson",
          brief: `Lesson ${lesson.n} of ${syllabus.lessons.length} — "${lesson.title}" (course: ${syllabus.courseTitle}). ${lesson.brief} Follow the attached outline; previous lessons attached for continuity.`,
          sourceReport,
          allowResearch: outline.allowResearch,
          createdById: batch.createdById,
        },
      });
      lessonRunIds.push(run.id);
      await prisma.courseBatch.update({
        where: { id: batchId },
        data: { lessonRunIds: lessonRunIds as unknown as Prisma.InputJsonValue },
      });

      await executeRun(run.id);
      const finished = await prisma.agentRun.findUnique({ where: { id: run.id } });
      if (finished?.status !== "READY") {
        throw new Error(
          `Lesson ${lesson.n} failed: ${((finished?.error as { message?: string }) ?? {}).message ?? "unknown error"}`
        );
      }

      // 3 — Assets for this lesson (best-effort; failures don't stop the course).
      await generateLessonAssets(
        batch.createdById,
        keys,
        models.writer,
        syllabus.courseTitle,
        lesson,
        finished
      );
      await syncDownloadsToContent(finished.id).catch(() => {});

      await prisma.courseBatch.update({
        where: { id: batchId },
        data: { currentLesson: i + 1 },
      });
    }

    await prisma.courseBatch.update({
      where: { id: batchId },
      data: { status: "READY" },
    });
  } catch (err) {
    await prisma.courseBatch
      .update({
        where: { id: batchId },
        data: {
          status: "FAILED",
          error: {
            message: err instanceof Error ? err.message : String(err),
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
  }
}

async function generateLessonAssets(
  createdById: string | null,
  keys: ProviderKeys,
  writerModel: string,
  courseTitle: string,
  lesson: SyllabusLesson,
  lessonRun: AgentRun
): Promise<void> {
  const uploader: SessionUser = {
    id: createdById ?? "00000000-0000-0000-0000-000000000000",
    role: "ADMIN",
    status: "ACTIVE",
  };
  for (let i = 0; i < (lesson.assets ?? []).length; i++) {
    const asset = lesson.assets[i];
    const target = `asset-${i + 1}`;
    const existing = await prisma.agentAsset.findUnique({
      where: { runId_target: { runId: lessonRun.id, target } },
    });
    if (existing?.status === "READY") continue;
    const row = await prisma.agentAsset.upsert({
      where: { runId_target: { runId: lessonRun.id, target } },
      update: { status: "GENERATING", error: Prisma.DbNull },
      create: {
        runId: lessonRun.id,
        target,
        kind: asset.kind,
        status: "GENERATING",
        createdById,
      },
    });
    try {
      const res = await callRole(
        keys,
        writerModel,
        assetMessages(courseTitle, lesson.title, lessonRun.draftText ?? "", asset),
        12000
      );
      const spec = parseJsonOutput<{
        filename?: string;
        docx?: DocxSpec;
        xlsx?: XlsxSpec;
      }>(res.text);
      let buffer: Buffer;
      let mime: string;
      let ext: string;
      if (asset.kind === "docx" && spec.docx) {
        buffer = await renderDocx(spec.docx);
        mime = DOCX_MIME;
        ext = "docx";
      } else if (asset.kind === "xlsx" && spec.xlsx) {
        buffer = await renderXlsx(spec.xlsx);
        mime = XLSX_MIME;
        ext = "xlsx";
      } else {
        throw new Error("Asset spec missing the expected document payload.");
      }
      const filename = (spec.filename ?? `${asset.name}.${ext}`)
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(new RegExp(`(\\.${ext})?$`), `.${ext}`);
      const media = await createAssetFromUpload(uploader, {
        buffer,
        filename,
        mimeType: mime,
        sizeBytes: buffer.length,
      });
      await prisma.agentAsset.update({
        where: { id: row.id },
        data: { status: "READY", mediaAssetId: media.id, filename },
      });
    } catch (err) {
      await prisma.agentAsset
        .update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            error: {
              message: err instanceof Error ? err.message : String(err),
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});
    }
  }
}

/** Assets for a run, with download URLs joined in. */
export async function listRunAssets(runId: string) {
  const assets = await prisma.agentAsset.findMany({
    where: { runId },
    orderBy: { target: "asc" },
  });
  const mediaIds = assets.map((a) => a.mediaAssetId).filter(Boolean) as string[];
  const media = mediaIds.length
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: mediaIds } },
        select: { id: true, url: true },
      })
    : [];
  return assets.map((a) => ({
    id: a.id,
    target: a.target,
    kind: a.kind,
    filename: a.filename,
    status: a.status,
    error: a.error,
    url: media.find((m) => m.id === a.mediaAssetId)?.url ?? null,
  }));
}


/** Merge a lesson run's READY assets into its filed ContentItem downloads. */
async function syncDownloadsToContent(lessonRunId: string): Promise<void> {
  const run = await prisma.agentRun.findUnique({ where: { id: lessonRunId } });
  if (!run?.contentId) return;
  const item = await prisma.contentItem.findUnique({ where: { id: run.contentId } });
  if (!item) return;
  const assets = await prisma.agentAsset.findMany({
    where: { runId: lessonRunId, status: "READY", mediaAssetId: { not: null } },
    orderBy: { target: "asc" },
  });
  if (assets.length === 0) return;
  const data = (item.typeData ?? {}) as { downloads?: { mediaAssetId: string; label: string }[] };
  const existing = data.downloads ?? [];
  const merged = [...existing];
  for (const a of assets) {
    if (!merged.some((d) => d.mediaAssetId === a.mediaAssetId)) {
      merged.push({
        mediaAssetId: a.mediaAssetId as string,
        label: humanizeFilename(a.filename ?? a.kind),
      });
    }
  }
  if (merged.length !== existing.length) {
    await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        typeData: { ...(item.typeData as object), downloads: merged.slice(0, 6) } as never,
      },
    });
  }
}

/**
 * Retrofit assets onto a finished course: when the stored syllabus has no
 * asset specs (older courses / thin outlines), re-derive them from the
 * outline + lesson content, then generate every missing file. Incremental —
 * READY assets are never regenerated.
 */
export async function regenerateCourseAssets(
  outlineRunId: string
): Promise<{ started: boolean }> {
  const batch = await prisma.courseBatch.findUnique({ where: { outlineRunId } });
  if (!batch || batch.status !== "READY") {
    throw new ConflictError("Assets can only be (re)generated for a finished course.");
  }
  void (async () => {
    try {
      const outline = await prisma.agentRun.findUnique({ where: { id: outlineRunId } });
      if (!outline?.draftText) return;
      const { keys, models } = await loadKeysAndModels();
      let syllabus = batch.syllabus as unknown as Syllabus | null;
      const totalSpecced = (syllabus?.lessons ?? []).reduce(
        (n, l) => n + (l.assets?.length ?? 0),
        0
      );
      if (!syllabus || totalSpecced === 0) {
        const res = await callRole(keys, models.orchestrator, syllabusMessages(outline), 8000);
        const fresh = parseJsonOutput<Syllabus>(res.text);
        // Keep the existing lesson list authoritative; adopt only the assets.
        if (syllabus) {
          syllabus.lessons = syllabus.lessons.map((l, i) => ({
            ...l,
            assets: fresh.lessons[i]?.assets ?? [],
          }));
        } else {
          syllabus = fresh;
        }
        await prisma.courseBatch.update({
          where: { id: batch.id },
          data: { syllabus: syllabus as unknown as Prisma.InputJsonValue },
        });
      }
      const lessonRunIds = (batch.lessonRunIds as string[]) ?? [];
      for (let i = 0; i < syllabus.lessons.length && i < lessonRunIds.length; i++) {
        const lessonRun = await prisma.agentRun.findUnique({
          where: { id: lessonRunIds[i] },
        });
        if (lessonRun?.status === "READY") {
          await generateLessonAssets(
            batch.createdById,
            keys,
            models.writer,
            syllabus.courseTitle,
            syllabus.lessons[i],
            lessonRun
          );
          await syncDownloadsToContent(lessonRun.id).catch(() => {});
        }
      }
    } catch {
      // best-effort: individual asset failures are recorded on AgentAsset rows
    }
  })();
  return { started: true };
}


/** Retrofit assets by course slug (Course Manager entry point). */
export async function regenerateCourseAssetsBySlug(
  courseSlug: string
): Promise<{ started: boolean }> {
  const batches = await prisma.courseBatch.findMany({ where: { status: "READY" } });
  const batch = batches.find(
    (b) => b.courseTitle && slugify(b.courseTitle) === courseSlug
  );
  if (!batch) {
    throw new NotFoundError(
      "No generated course matches this slug — assets can only be generated for agent-generated courses."
    );
  }
  return regenerateCourseAssets(batch.outlineRunId);
}
