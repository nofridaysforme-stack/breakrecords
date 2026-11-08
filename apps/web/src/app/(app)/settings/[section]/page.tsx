import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { ScreenState } from '@/components/ui/ScreenState';
import { SettingsNav, SettingsSectionView } from '@/components/settings/SettingsViews';
import { ThemeEditor } from '@/components/settings/ThemeEditor';
import { OPS_STATES } from '@/data/opsStates';
import { toScenario } from '@/data/types';
import { getDepartments, getSettings, getTheme } from '@/data/api';
import { settingsNav, type SettingsSection } from '@/data/ops';
import s from '@/components/settings/Settings.module.css';

type Props = { params: Promise<{ section: string }>; searchParams: Promise<{ state?: string }> };

const find = (id: string) => settingsNav.find((n) => n.id === id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = find((await params).section);
  return { title: n ? `Settings: ${n.label}` : 'Settings' };
}

export function generateStaticParams() { return settingsNav.map((n) => ({ section: n.id })); }

export default async function SettingsPage({ params, searchParams }: Props) {
  const { section } = await params;
  if (section === 'general') redirect('/settings/routing');
  const nav = find(section);
  if (!nav) notFound();
  const scenario = toScenario((await searchParams).state);

  // 5i has its own three columns and no settings sub-nav, as drawn.
  if (section === 'white-label') {
    if (scenario === 'default') return <Page bare><ThemeEditor data={await getTheme()} /></Page>;
    return <Page><ScreenState scenario={scenario} copy={OPS_STATES.theme} heading="Theme for Harbor Sound"><ThemeEditor data={await getTheme()} /></ScreenState></Page>;
  }

  const data = await getSettings();
  return (
    <Page bare>
      <div className={s.layout}>
        <SettingsNav nav={data.nav} current={section as SettingsSection} />
        <div className={s.main}>
          <ScreenState scenario={scenario} copy={OPS_STATES.settings} heading={nav.label}>
            <SettingsSectionView data={data} section={section as SettingsSection} depts={(await getDepartments()).departments} />
          </ScreenState>
        </div>
      </div>
    </Page>
  );
}
