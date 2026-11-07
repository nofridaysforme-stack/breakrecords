import { Body, Eyebrow, PageTitle } from '@/components/type/Type';
import s from './Placeholder.module.css';

type Props = { title: string; phase: string; frames?: string };

/** Stand-in for a screen that a later phase builds. Removed as each screen lands. */
export function Placeholder({ title, phase, frames }: Props) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <div className={s.card}>
        <Eyebrow>{phase}</Eyebrow>
        <Body>This screen is built in a later phase. Phase A set up the shell, tokens and type it will use.</Body>
        {frames && <Body className={s.frames}>Design frames: {frames}</Body>}
      </div>
    </>
  );
}
