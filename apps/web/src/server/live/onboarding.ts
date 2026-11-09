import 'server-only';
import type { z } from 'zod';
import type { OnboardingAnswers } from '@breakrecords/contract';
import { withTenant } from '@breakrecords/db/client';
import { PROFILES } from '@/components/onboarding/steps';
import { sql } from '../db';
import type { RequestContext } from '../context';

type Answers = z.infer<typeof OnboardingAnswers>;
const COUNTRY: Record<string, string> = { 'United States': 'US', Canada: 'CA', 'United Kingdom': 'GB', Ireland: 'IE', Australia: 'AU', 'New Zealand': 'NZ' };

export function liveOnboarding(ctx: RequestContext): Promise<{ answers: Answers | null; completed: boolean }> {
  return withTenant(sql, ctx, async (tx) => {
    const [r] = await tx<{ answers: Answers; completed_at: Date | null }[]>`SELECT answers, completed_at FROM onboarding`;
    return { answers: r?.answers ?? null, completed: !!r?.completed_at };
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
      await tx`UPDATE departments SET autonomy = CASE WHEN ${answers.autonomy}::autonomy_level = 'act_within_limits' AND NOT can_act THEN 'draft_and_wait' ELSE ${answers.autonomy}::autonomy_level END
        WHERE phase = 1`;
      // Owners name the workspace and set what kind it is (artist or label) from the profile.
      if (ctx.role === 'owner') await tx`SELECT app_apply_onboarding(${answers.name}, ${answers.profile})`;
      await tx`UPDATE onboarding SET completed_at = now(), completed_by = ${ctx.userId} WHERE tenant_id = ${ctx.tenantId}`;
      await tx`INSERT INTO audit_events (tenant_id, audit_id, actor, kind, ref, data)
        VALUES (${ctx.tenantId}, ${'AUD-ONB-' + crypto.randomUUID().slice(0, 8).toUpperCase()}, ${ctx.userId}, 'onboarding.completed', ${answers.profile}, ${tx.json({ autonomy: answers.autonomy, country: answers.country })})`;
    }
    const [r] = await tx<{ completed_at: Date | null }[]>`SELECT completed_at FROM onboarding`;
    return { answers, completed: !!r?.completed_at };
  });
}

/** A workspace made by sign-up goes through onboarding before anything else. */
export function liveNeedsOnboarding(ctx: RequestContext): Promise<boolean> {
  return withTenant(sql, ctx, async (tx) => (await tx<{ n: boolean }[]>`SELECT app_needs_onboarding() AS n`)[0].n);
}
