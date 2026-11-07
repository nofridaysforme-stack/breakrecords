import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { STEPS, type StepId } from '@/components/onboarding/steps';

type Params = { params: Promise<{ step: string }> };

export function generateStaticParams() {
  return STEPS.map((s) => ({ step: s.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { step: id } = await params;
  const step = STEPS.find((s) => s.id === id);
  return { title: `Set up${step ? `: ${step.label}` : ''}` };
}

export default async function OnboardingStep({ params }: Params) {
  const { step } = await params;
  if (!STEPS.some((s) => s.id === step)) notFound();
  return <Onboarding step={step as StepId} />;
}
