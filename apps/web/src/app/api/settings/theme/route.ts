import { NextResponse } from 'next/server';
import { PublishThemeCommand } from '@breakrecords/contract';
import { getTheme } from '@/data/api';
import { checkTheme } from '@/lib/theme';
import { mockPublishTheme } from '@/server/mockSettings';
import { livePublishTheme } from '@/server/live/settings';
import { payoutErr as err, teamOnly, teamWriter } from '@/server/teamRoute';

export async function GET() { return (await teamOnly('Settings')) ?? NextResponse.json(await getTheme()); }

/** Publish the white-label theme. Refused unless every text pair passes WCAG AA; live, only the licensee's owners may. Audited. */
export async function POST(req: Request) {
  const body = PublishThemeCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Send five colors as 6-digit hex values.');
  const theme = Object.fromEntries(Object.entries(body.data.theme).map(([k, v]) => [k, v.toLowerCase()])) as typeof body.data.theme;
  const who = await teamWriter('settings', 'settings');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await livePublishTheme(who.ctx, theme);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const failing = checkTheme(theme).filter((c) => !c.pass);
  if (failing.length) return err(409, 'fails_contrast', `${failing.map((f) => f.pair).join(', ')} ${failing.length === 1 ? 'fails' : 'fail'} WCAG AA.`);
  await mockPublishTheme(theme);
  return NextResponse.json(await getTheme());
}
