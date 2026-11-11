import 'server-only';
import type { z } from 'zod';
import type { OnboardingAnswers } from '@breakrecords/contract';
import { withTenant } from '@breakrecords/db/client';
import { defaultPublishing, PROFILES } from '@/components/onboarding/steps';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Answers = z.infer<typeof OnboardingAnswers>;
const COUNTRY: Record<string, string> = { 'United States': 'US', Canada: 'CA', 'United Kingdom': 'GB', Ireland: 'IE', Australia: 'AU', 'New Zealand': 'NZ' };

/** A real workspace's setup starts blank, never from the sample label. */
const BLANK: Answers = {
  profile: 'solo', name: '', country: 'United States', distributor: null, catalogFile: null, pro: { status: 'not_sure' }, autonomy: 'draft_and_wait', members: [],
};

/** Departments set to their own level: anything not on the workspace's saved default. */
const customDepartments = (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => tx<{ name: string }[]>`
  SELECT d.name FROM departments d JOIN label_settings s ON s.tenant_id = d.tenant_id
  WHERE d.phase = 1 AND s.default_autonomy IS NOT NULL AND d.autonomy IS DISTINCT FROM s.default_autonomy
    -- a department that can't act alone sits at Draft and wait when the default is Act within limits
    AND NOT (s.default_autonomy = 'act_within_limits' AND NOT d.can_act AND d.autonomy = 'draft_and_wait')
  ORDER BY d.position`;

export function liveOnboarding(ctx: RequestContext): Promise<{ answers: Answers | null; completed: boolean; live: true; defaults: Answers; customDepartments: string[] }> {
  return withTenant(sql, ctx, async (tx) => {
    const [r] = await tx<{ answers: Answers; completed_at: Date | null }[]>`SELECT answers, completed_at FROM onboarding`;
    const custom = (await customDepartments(tx)).map((d) => d.name);
    return { answers: r?.answers ?? null, completed: !!r?.completed_at, live: true, defaults: { ...BLANK, name: ctx.tenantName === 'My workspace' ? '' : ctx.tenantName }, customDepartments: custom };
  });
}

/**
 * Saves the answers. Completing sets the label up from them: its profile and country, and each
 * active department's autonomy, capped where the work is money, signatures or filings. Audited.
 */
export function liveSaveOnboarding(ctx: RequestContext, answers: Answers, complete: boolean) {
  return withTenant(sql, ctx, async (tx) => {
    await tx`INSERT INTO onboarding (tenant_id, answers, updated_by) VALUES (${ctx.tenantId}, ${tx.json(answers)}, ${ctx.userId})
      ON CONFLICT (tenant_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = now(), updated_by = EXCLUDED.updated_by`;
    if (complete) {
      const profile = PROFILES.find((p) => p.id === answers.profile)!.name;
      const country = COUNTRY[answers.country];
      await tx`INSERT INTO label_settings (tenant_id, country, profile, statement_period, spend_cap_cents)
        VALUES (${ctx.tenantId}, ${country ?? 'US'}, ${profile}, 'Monthly, artists quarterly', 30000)
        ON CONFLICT (tenant_id) DO UPDATE SET profile = EXCLUDED.profile${country ? tx`, country = EXCLUDED.country` : tx``}`;
      // Re-running setup is an edit, not a reset (ONB-03): only departments still on the old default
      // move to the new one; any you set yourself keep their level. The chosen level is saved as the
      // default (ONB-04), which is what Settings shows.
      const keep = new Set((await customDepartments(tx)).map((d) => d.name));
      await tx`UPDATE departments SET autonomy = CASE WHEN ${answers.autonomy}::autonomy_level = 'act_within_limits' AND NOT can_act THEN 'draft_and_wait' ELSE ${answers.autonomy}::autonomy_level END
        WHERE phase = 1 AND NOT (name = ANY(ARRAY(SELECT jsonb_array_elements_text(${tx.json([...keep])}::jsonb))))`;
      await tx`UPDATE label_settings SET default_autonomy = ${answers.autonomy}, publishing_mode = ${answers.publishing?.mode ?? defaultPublishing(answers.profile)} WHERE tenant_id = ${ctx.tenantId}`;
      // Owners name the workspace and set what kind it is (artist, label, or label services).
      if (ctx.role === 'owner') await tx`SELECT app_apply_onboarding(${answers.name}, ${answers.profile})`;
      // A band's other members become co-owners: they sign in with their email (nothing is sent).
      if (ctx.role === 'owner' && answers.profile === 'band') {
        for (const email of new Set((answers.members ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e && e !== ctx.email))) {
          await tx`INSERT INTO allowlist (email, tenant_id, role, added_by) VALUES (${email}, ${ctx.tenantId}, 'owner', ${ctx.userId}) ON CONFLICT (email, tenant_id) DO NOTHING`;
          await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
            VALUES (${ctx.tenantId}, ${'AUD-INV-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'invite.created', ${email}, ${tx.json({ role: 'owner', payee: null })})`;
        }
      }
      await tx`UPDATE onboarding SET completed_at = now(), completed_by = ${ctx.userId} WHERE tenant_id = ${ctx.tenantId}`;
      await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
        VALUES (${ctx.tenantId}, ${'AUD-ONB-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'onboarding.completed', ${answers.profile},
                ${tx.json({ autonomy: answers.autonomy, country: answers.country, publishing: answers.publishing?.mode ?? defaultPublishing(answers.profile), kept: [...keep] })})`;
    }
    const [r] = await tx<{ completed_at: Date | null }[]>`SELECT completed_at FROM onboarding`;
    return { answers, completed: !!r?.completed_at, live: true as const };
  });
}

/** A workspace made by sign-up goes through onboarding before anything else. */
export function liveNeedsOnboarding(ctx: RequestContext): Promise<boolean> {
  return withTenant(sql, ctx, async (tx) => (await tx<{ n: boolean }[]>`SELECT app_needs_onboarding() AS n`)[0].n);
}
