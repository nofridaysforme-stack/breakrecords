import { NextResponse } from 'next/server';
import { SaveOnboardingCommand } from '@breakrecords/contract';
import { authRequired, getContext } from '@/server/context';
import { isLive } from '@/server/modules';
import { mockOnboarding, mockSaveOnboarding } from '@/server/mockOnboarding';
import { liveOnboarding, liveSaveOnboarding } from '@/server/live/onboarding';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';

/** The onboarding answers so far. */
export async function GET() {
  const refused = await teamOnly('Onboarding answers');
  if (refused) return refused;
  if (authRequired() && isLive('settings')) { const ctx = await getContext(); if (ctx) return NextResponse.json(await liveOnboarding(ctx)); }
  return NextResponse.json(await mockOnboarding());
}

/** Save the answers as the person goes; `complete` sets the label up from them. Audited when completed. */
export async function PUT(req: Request) {
  const body = SaveOnboardingCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Those answers aren’t complete.');
  const who = await teamWriter('settings', 'onboarding');
  if ('refused' in who) return who.refused;
  if (who.ctx) return NextResponse.json(await liveSaveOnboarding(who.ctx, body.data.answers, !!body.data.complete));
  return NextResponse.json(await mockSaveOnboarding(body.data.answers, !!body.data.complete));
}
