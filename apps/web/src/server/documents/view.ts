import 'server-only';
import { DOC_LABEL, DOCS_FOR, gapSummary, type DocKind, type DocSubject, type Gap } from '@breakrecords/core/documents';
import type { DocReview, DocumentsResponse } from '@breakrecords/contract';

// The Documents view, shared by the mock and live backends: every song, recording and release
// with the documents it can have and the latest version of each.

export type SubjectRef = { subject: DocSubject; id: string; title: string; artist: string; detail: string };
export type DocRow = {
  id: string; kind: DocKind; subjectId: string; version: number; preparedAt: Date; preparedBy: string;
  gaps: Gap[]; hasCsv: boolean; review: DocReview | null;
};

/** Whether AI review can run at all on this server: the platform switch and a key. */
export function aiAvailable(): boolean {
  return process.env.BR_AI === 'on' && !!process.env.ANTHROPIC_API_KEY;
}

export function aiState(on: boolean, canChange: boolean): DocumentsResponse['ai'] {
  const available = aiAvailable();
  return {
    available, on: available && on, canChange,
    note: !available ? 'AI review is switched off for the platform.' : on ? 'AI review is on. It suggests; it never changes a document.' : 'AI review is off for this label.',
  };
}

const at = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function documentsView(subjects: SubjectRef[], docs: DocRow[], ai: DocumentsResponse['ai']): DocumentsResponse {
  return {
    ai,
    artists: [...new Set(subjects.map((s) => s.artist))].sort(),
    subjects: subjects.map((s) => ({
      ...s,
      docs: DOCS_FOR[s.subject].map((kind) => {
        const mine = docs.filter((d) => d.kind === kind && d.subjectId === s.id).sort((a, b) => b.version - a.version);
        const d = mine[0];
        return {
          kind, label: DOC_LABEL[kind], versions: mine.length,
          latest: d ? { id: d.id, version: d.version, preparedAt: at(d.preparedAt), preparedBy: d.preparedBy, gaps: d.gaps, summary: gapSummary(d.gaps), hasCsv: d.hasCsv, review: d.review } : null,
        };
      }),
    })),
  };
}
