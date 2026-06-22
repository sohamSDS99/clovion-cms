/**
 * Pure helpers for inline Tiptap body-embed scanning (FR-MEDIA-04).
 *
 * Kept in a dependency-free module (no Prisma / next-auth) so the document walk
 * stays unit-testable in isolation. `lib/media/service.ts` imports + re-exports
 * these for the `whereUsed` body-embed pass.
 */

/**
 * Identifiers an inline Tiptap image node may use to reference an asset. We
 * match on an explicit `assetId` attr (the editor's preferred linkage) OR on the
 * asset's public `url` / `storageKey` appearing in the image `src` (covers
 * embeds that only carry a URL).
 */
export interface EmbedAssetMatch {
  id: string;
  url: string;
  storageKey: string;
}

/**
 * Pure: walk a Tiptap doc JSON tree and decide whether any inline node embeds
 * the given asset. We look at image/* nodes (node.type containing "image") and
 * inspect their attrs for:
 *   - attrs.assetId === asset.id            (explicit linkage)
 *   - attrs.src contains asset.url          (URL embed)
 *   - attrs.src contains asset.storageKey   (key embed / proxied URL)
 *
 * The walk is defensive: `doc` is untrusted JSON so every access is guarded.
 * Returns true on the first match (short-circuits) for efficiency.
 */
export function findEmbeddedAssetRefs(
  doc: unknown,
  asset: EmbedAssetMatch
): boolean {
  const matchesNode = (node: Record<string, unknown>): boolean => {
    const type = typeof node.type === "string" ? node.type : "";
    if (!type.toLowerCase().includes("image")) return false;
    const attrs =
      node.attrs && typeof node.attrs === "object"
        ? (node.attrs as Record<string, unknown>)
        : null;
    if (!attrs) return false;

    if (typeof attrs.assetId === "string" && attrs.assetId === asset.id) {
      return true;
    }
    const src = typeof attrs.src === "string" ? attrs.src : "";
    if (src) {
      if (asset.url && src.includes(asset.url)) return true;
      if (asset.storageKey && src.includes(asset.storageKey)) return true;
    }
    return false;
  };

  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (visit(child)) return true;
      }
      return false;
    }
    if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      if (matchesNode(node)) return true;
      // Recurse into nested objects/arrays (e.g. the Tiptap `content` array) so
      // we catch images at any depth.
      for (const key of Object.keys(node)) {
        if (visit(node[key])) return true;
      }
      return false;
    }
    return false;
  };

  return visit(doc);
}
