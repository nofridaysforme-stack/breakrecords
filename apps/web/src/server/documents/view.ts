import 'server-only';
import { DOC_LABEL, DOCS_FOR, gapSummary, type DocKind, type DocSubject, type Gap, type PrepareOptions } from '@breakrecords/core/documents';
import type { DocReview, DocumentsResponse } from '@breakrecords/contract';

// The Documents view, shared by the mock and live backends: every song, recording and release
// with the documents it can have and the latest version of each.

export type SubjectRef = { subject: DocSubject; id: string; title: string; artist: string; detail: string; payees?: string[] };
export type DocRow = {
  id: string; kind: DocKind; subjectId: string; version: number; preparedAt: Date; preparedBy: string;
  gaps: Gap[]; hasCsv: boolean; review: DocReview | null; options?: PrepareOptions | null;
};

/** Whether AI review can run at all on this server: the platform switch and a key. */
export function aiAvailable(): boolean {
  return process.env.BR_AI === 'on' && !!process.env.ANTHROPIC_API_KEY;
}

export function aiState(on: boolean, canChange: boolean): DocumentsResponse['ai'] {
  const available = aiAvailable();
  return {
    available, on: available && on, canChange,
    // What it is, then what it means right now and who can change it.
    note: !available
      ? 'AI review reads a prepared document and points out anything missing or inconsistent. It never changes a document. It isn’t available yet: Indie SRVCS turns it on for every workspace once it’s set up, and then your owner can switch it on here.'
      : on ? 'AI review is on. It reads each prepared document and points out anything missing or inconsistent; it never changes a document.'
      : canChange ? 'AI review is off for this workspace. Turn it on to have each prepared document checked for anything missing or inconsistent; it never changes a document.'
      : 'AI review is off for this workspace. An owner can turn it on here.',
  };
}

const at = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function documentsView(subjects: SubjectRef[], docs: DocRow[], ai: DocumentsResponse['ai']): DocumentsResponse {
  return {
    ai,
    artists: [...new Set(subjects.map((s) => s.artist))].sort(),
    subjects: subjects.map(({ payees, ...s }) => ({
      ...s,
      docs: DOCS_FOR[s.subject].map((kind) => {
        const mine = docs.filter((d) => d.kind === kind && d.subjectId === s.id).sort((a, b) => b.version - a.version);
        const d = mine[0];
        return {
          kind, label: DOC_LABEL[kind], versions: mine.length,
          latest: d ? { id: d.id, version: d.version, preparedAt: at(d.preparedAt), preparedBy: d.preparedBy, gaps: d.gaps, summary: gapSummary(d.gaps), hasCsv: d.hasCsv, review: d.review } : null,
          ...(kind === 'sx_lod' ? { lod: { payees: payees ?? [], last: d?.options?.lod ?? null } } : {}),
        };
      }),
    })),
  };
}
