"use client";

/** Shared "delete this content" affordance for editor layouts. */
export function DeleteLink({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="px-1">
      <button
        onClick={onDelete}
        className="text-xs text-ink-faint hover:text-danger hover:underline"
      >
        Delete this content
      </button>
    </div>
  );
}
