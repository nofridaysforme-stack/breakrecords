import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { PreparedDoc } from '@breakrecords/core/documents';
import type { DocReview } from '@breakrecords/contract';

// AI review of a prepared document (Claude). It reads the document and answers with findings and
// plain-English next steps. It never edits the document or the catalog: what it says is saved as
// a suggestion beside the document, labelled as AI. It runs only when the platform switch
// (BR_AI=on with an ANTHROPIC_API_KEY) and the label's own setting are both on.
// Addresses and email addresses are left out of what is sent.

export const AI_MODEL = 'claude-opus-5-5';

const Review = z.object({
  findings: z.array(z.object({
    severity: z.enum(['problem', 'check']),
    message: z.string(),
  })),
  next_steps: z.string(),
});

const SYSTEM = `You review music rights paperwork prepared for an independent label or artist in the US: split sheets, PRO and MLC registration packets, SoundExchange packets, US Copyright Office worksheets and label copy.

You get one prepared document as JSON, with the gaps the platform already found. Look for what a careful rights administrator would catch that the gaps don't already say: names spelled differently across rows, shares that look wrong for the people listed, a writer listed with no role, titles that may collide with alternate titles, a recording owner that looks inconsistent with the label, and anything that would make the organization reject or misfile it.

Rules:
- Only point out what the document shows. Never invent a fact (an IPI, a PRO, a date, a share) and never suggest a value for a missing one; say it needs to be found.
- Don't repeat a gap the platform already listed.
- "problem" means it would likely cause a rejected or wrong registration; "check" means a person should confirm it.
- Return at most 8 findings, most important first. An empty list is fine.
- next_steps: two to four short sentences, plain English for a non-expert, saying what to do next with this document. No legal advice.
- No em dashes.`;

/** The document as sent for review: everything but addresses and email addresses. */
export function redactForReview(doc: PreparedDoc) {
  const hidden = /address|e-?mail/i;
  return {
    title: doc.title, kind: doc.kind, gaps_already_found: doc.gaps,
    sections: doc.sections.map((s) => ({
      heading: s.heading, intro: s.intro, steps: s.steps,
      rows: s.rows?.filter(([label]) => !hidden.test(label)),
      table: s.table && (() => {
        const keep = s.table.columns.map((c, i) => (hidden.test(c) ? -1 : i)).filter((i) => i >= 0);
        return { columns: keep.map((i) => s.table!.columns[i]), rows: s.table.rows.map((r) => keep.map((i) => r[i])) };
      })(),
    })),
  };
}

export class AiRefused extends Error {}

/** Asks Claude to review the document. Throws AiRefused if the model declines. */
export async function reviewDocument(doc: PreparedDoc): Promise<Pick<DocReview, 'model' | 'findings' | 'nextSteps'>> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: betaZodOutputFormat(Review) },
    messages: [{ role: 'user', content: JSON.stringify(redactForReview(doc)) }],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new AiRefused('The AI couldn’t review this document. Nothing was changed.');
  const out = response.parsed_output;
  return { model: response.model, findings: out.findings.slice(0, 8), nextSteps: out.next_steps };
}
