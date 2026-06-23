"use client";

import type { EditorLayoutProps } from "./types";
import { GenericLayout } from "./GenericLayout";
import { WebinarLayout } from "./WebinarLayout";
import { ResourceLayout } from "./ResourceLayout";
import { FaqLayout } from "./FaqLayout";

/**
 * Dispatches to a purpose-built layout per content type. BLOG/NEWS use the
 * article-centric GenericLayout; WEBINAR/RESOURCE/FAQ get layouts that
 * foreground their primary content (event details / the file + gating / the
 * Q&A list) rather than a long-form body.
 */
export function ContentLayout(props: EditorLayoutProps) {
  switch (props.item.type) {
    case "WEBINAR":
      return <WebinarLayout {...props} />;
    case "RESOURCE":
      return <ResourceLayout {...props} />;
    case "FAQ":
      return <FaqLayout {...props} />;
    default:
      return <GenericLayout {...props} />;
  }
}
