import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Compass, Languages, Sparkles } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth, useSettings } from '../lib/context';
import type { SettingsData } from '../lib/types';
import { Button, Card, Segmented, useDocumentTitle } from '../components/ui';

export default function Welcome() {
  const { status } = useAuth();
  const { settings, update } = useSettings();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [schedule, setSchedule] = useState<SettingsData['schedule']>(settings?.schedule ?? 'daily');
  const [intensity, setIntensity] = useState<SettingsData['intensity']>(settings?.intensity ?? 'standard');
  const [lang, setLang] = useState<SettingsData['explanationLanguage']>(settings?.explanationLanguage ?? 'auto');
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Welcome');

  async function savePrefs() {
    setBusy(true);
    try {
      await update({ schedule, intensity, explanationLanguage: lang });
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function skipPlacement() {
    setBusy(true);
    try {
      await post('/placement/skip');
      await qc.invalidateQueries();
      navigate('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-xl">
        {step === 0 && (
          <Card className="animate-slide-up p-6 sm:p-8">
            <Sparkles className="size-8 text-primary" />
            <h1 className="mt-3 text-2xl font-bold">Hi {status?.user?.displayName}! Сайн байна уу!</h1>
            <p className="mt-3 text-[16px] leading-relaxed">
              Fluent Path is your personal English course from <strong>B1</strong> to <strong>C1</strong>. Every day it tells you exactly what to study: new lessons, reviews at the right
              time, and practice for your weakest skills.
            </p>
            <ul className="mt-4 space-y-2 text-[15px]">
              <li>📚 A structured course: B1 → B1+ → B2 → B2+ → C1</li>
              <li>🧠 Words come back for review just before you forget them</li>
              <li>🎯 Your weak skills get more practice automatically</li>
              <li>🎮 Games, challenges and speaking practice — not a textbook</li>
            </ul>
            <Button className="mt-6" block size="lg" onClick={() => setStep(1)} icon={<ArrowRight className="size-5" />}>
              Let's set up your plan
            </Button>
          </Card>
        )}

        {step === 1 && (
          <Card className="animate-slide-up space-y-6 p-6 sm:p-8">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CalendarDays className="size-5 text-primary" /> How often will you study?
              </h2>
              <p className="mb-3 text-sm text-muted">Both work. Missing a day never resets your progress.</p>
              <Segmented
                label="Study frequency"
                value={schedule}
                onChange={setSchedule}
                options={[
                  { value: 'daily', label: 'Every day', hint: 'Shorter, steady sessions' },
                  { value: 'alternate', label: 'Every other day', hint: 'Reviews are timed for your rest days' },
                ]}
              />
            </div>
            <div>
              <h2 className="text-lg font-bold">How much time per study day?</h2>
              <Segmented
                label="Intensity"
                value={intensity}
                onChange={setIntensity}
                options={[
                  { value: 'casual', label: 'Casual', hint: '15–20 min' },
                  { value: 'standard', label: 'Standard', hint: '25–35 min' },
                  { value: 'intensive', label: 'Intensive', hint: '45–60 min' },
                ]}
              />
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Languages className="size-5 text-primary" /> Explanations
              </h2>
              <p className="mb-3 text-sm text-muted">Automatic: more Mongolian at B1, mostly English at B2, English at C1.</p>
              <Segmented
                label="Explanation language"
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'auto', label: 'Automatic' },
                  { value: 'mixed', label: 'English + Монгол' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
            <Button block size="lg" loading={busy} onClick={savePrefs} icon={<ArrowRight className="size-5" />}>
              Continue
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card className="animate-slide-up p-6 sm:p-8">
            <Compass className="size-8 text-primary" />
            <h2 className="mt-3 text-2xl font-bold">Find your starting point</h2>
            <p className="mt-3 text-[16px] leading-relaxed">
              The placement test checks grammar, vocabulary, reading, listening and writing (speaking is optional). It takes about 30–40 minutes. Questions get harder as you go — it's
              completely fine not to know all of them.
            </p>
            <p className="mt-2 text-sm text-muted">You get a CEFR profile for each skill, so the course can focus on what you need most.</p>
            <div className="mt-6 flex flex-col gap-2">
              <Button size="lg" onClick={() => navigate('/placement')} icon={<ArrowRight className="size-5" />}>
                Take the placement test
              </Button>
              <Button size="lg" variant="ghost" loading={busy} onClick={skipPlacement}>
                Skip for now and start at B1
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
