import { NextResponse } from 'next/server';
import { UpdateDepartmentCommand } from '@breakrecords/contract';
import { getDepartments } from '@/data/api';
import { departments, team } from '@/data/ops';
import { mockUpdateDepartment } from '@/server/mockActivity';
import { liveUpdateDepartment } from '@/server/live/activity';
import { payoutErr as err, teamWriter } from '@/server/teamRoute';

/** Change a department's autonomy or who it's handed to. Audited. "Act within limits" is refused where the work is money, signatures or filings. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = UpdateDepartmentCommand.safeParse(await req.json().catch(() => null));
  if (!body.success) return err(400, 'invalid', 'Send an autonomy level or a person.');
  const id = (await params).id;
  const who = await teamWriter('activity', 'departments');
  if ('refused' in who) return who.refused;
  if (who.ctx) {
    const out = await liveUpdateDepartment(who.ctx, id, body.data);
    return out.ok ? NextResponse.json(out.value) : err(out.status, out.error, out.message);
  }
  const d = departments.find((x) => x.id === id);
  if (!d) return err(404, 'not_found', 'No such department.');
  if (d.phase === 2) return err(409, 'not_allowed', `${d.name} arrives in Phase 2.`);
  if (body.data.autonomy === 'act_within_limits' && !d.canAct) return err(409, 'not_allowed', d.actNote);
  if (body.data.personId && !team.some((t) => t.id === body.data.personId)) return err(409, 'not_on_team', 'That person isn’t on your team.');
  await mockUpdateDepartment(id, body.data);
  return NextResponse.json(await getDepartments());
}
