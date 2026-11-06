import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Volume2 } from 'lucide-react';
import { INTENSITY_MINUTES } from '@shared/timeline';
import { post } from '../lib/api';
import { useAuth, useSettings, useToast } from '../lib/context';
import { englishVoices, loadVoices, naturalVoiceStatus, naturalVoicesWanted, play, setNaturalVoicesWanted, type NaturalVoiceStatus } from '../lib/tts';
import { recognitionAvailable, recordingAvailable } from '../lib/speech';
import { Badge, Button, Card, Field, Input, PageHeader, SectionTitle, Segmented, Spinner, Toggle, useDocumentTitle } from '../components/ui';

function naturalStatusText(on: boolean, s: NaturalVoiceStatus | null): string {
  const about = 'Human-like neural voices, made on this computer (no internet needed).';
  if (!on) return `${about} Off — the browser's own voice is used.`;
  if (!s) return about;
  if (!s.enabled) return `${about} Turned off on the server (NATURAL_VOICES=false).`;
  if (s.state === 'failed') return `${about} Not available right now, so the browser voice is used. ${s.error ?? ''}`;
  if (s.queued > 0) return `${about} On — preparing course audio in the background (${s.queued} lines to go).`;
  return `${about} On.`;
}

export default function Settings() {
  const { settings, update } = useSettings();
  const { status } = useAuth();
  const { push } = useToast();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [natural, setNatural] = useState(naturalVoicesWanted);
  const [naturalStatus, setNaturalStatus] = useState<NaturalVoiceStatus | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  useDocumentTitle('Settings');
  useEffect(() => {
    void loadVoices().then(() => setVoices(englishVoices()));
    void naturalVoiceStatus(true).then(setNaturalStatus);
  }, []);

  if (!settings) return <Spinner />;
  const save = async (patch: Parameters<typeof update>[0]) => {
    try {
      await update(patch);
    } catch (e) {
      push({ kind: 'error', title: 'Could not save', body: (e as Error).message });
    }
  };
  const range = INTENSITY_MINUTES[settings.intensity];

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    try {
      await post('/auth/password', pw);
      setPw({ current: '', next: '' });
      setPwMsg('Password changed.');
    } catch (err) {
      const e2 = err as Error & { details?: { message: string }[] };
      setPwMsg(e2.details?.[0]?.message ?? e2.message);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      <Card className="space-y-5">
        <SectionTitle>Study plan</SectionTitle>
        <div>
          <div className="mb-2 text-sm font-semibold">How often do you study?</div>
          <Segmented
            label="Study frequency"
            value={settings.schedule}
            onChange={(v) => void save({ schedule: v })}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'alternate', label: 'Every other day', hint: 'Reviews include the next rest day' },
            ]}
          />
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">Intensity</div>
          <Segmented
            label="Intensity"
            value={settings.intensity}
            onChange={(v) => void save({ intensity: v })}
            options={[
              { value: 'casual', label: 'Casual', hint: '15–20 min' },
              { value: 'standard', label: 'Standard', hint: '25–35 min' },
              { value: 'intensive', label: 'Intensive', hint: '45–60 min' },
            ]}
          />
        </div>
        <div>
          <label htmlFor="minutes" className="text-sm font-semibold">
            Minutes per study day: {settings.dailyMinutes}
          </label>
          <input
            id="minutes"
            type="range"
            min={10}
            max={90}
            step={5}
            value={settings.dailyMinutes}
            onChange={(e) => void save({ dailyMinutes: Number(e.target.value) })}
            className="mt-2 w-full accent-[var(--primary)]"
          />
          <p className="text-xs text-muted">
            Suggested for {settings.intensity}: {range.min}–{range.max} min. The daily session plan adapts to this.
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <SectionTitle>Explanations</SectionTitle>
        <Segmented
          label="Explanation language"
          value={settings.explanationLanguage}
          onChange={(v) => void save({ explanationLanguage: v })}
          options={[
            { value: 'auto', label: 'Automatic', hint: 'Less Mongolian as you progress' },
            { value: 'mixed', label: 'Mixed', hint: 'English + Монгол' },
            { value: 'mn', label: 'Монгол', hint: 'Mongolian first' },
            { value: 'en', label: 'English', hint: 'Tap “MN” to reveal' },
          ]}
        />
        <p className="text-xs text-muted">Now using: {settings.effectiveExplanationLanguage === 'en' ? 'English (Mongolian on tap)' : settings.effectiveExplanationLanguage === 'mn' ? 'Mongolian' : 'English with Mongolian'}.</p>
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Appearance & accessibility</SectionTitle>
        <Segmented
          label="Theme"
          value={settings.theme}
          onChange={(v) => void save({ theme: v })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Toggle checked={settings.largeText} onChange={(v) => void save({ largeText: v })} label="Larger text" description="Increase text size across the app." />
        <Toggle checked={settings.reduceMotion} onChange={(v) => void save({ reduceMotion: v })} label="Reduce motion" description="Turn off animations and transitions." />
      </Card>

      <Card className="space-y-4">
        <SectionTitle>Voice & audio</SectionTitle>
        <Toggle
          checked={natural}
          onChange={(v) => {
            setNaturalVoicesWanted(v);
            setNatural(v);
            void naturalVoiceStatus(true).then(setNaturalStatus);
          }}
          label="Natural voices"
          description={naturalStatusText(natural, naturalStatus)}
        />
        {voices.length === 0 ? (
          <p className="text-sm text-muted">No English voices found in this browser. Without natural voices, listening activities need a browser with speech (Chrome, Edge or Safari).</p>
        ) : (
          <Field label="Browser voice" hint="Used when natural voices are off or not ready yet.">
            {(id) => (
              <select
                id={id}
                value={settings.ttsVoice ?? ''}
                onChange={(e) => void save({ ttsVoice: e.target.value || null })}
                className="h-11 w-full rounded-xl bg-surface px-3 text-[15px] ring-1 ring-border focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="">Automatic (best available)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <div>
          <label htmlFor="rate" className="text-sm font-semibold">
            Speech speed: {settings.ttsRate.toFixed(2)}×
          </label>
          <input id="rate" type="range" min={0.7} max={1.3} step={0.05} value={settings.ttsRate} onChange={(e) => void save({ ttsRate: Number(e.target.value) })} className="mt-2 w-full accent-[var(--primary)]" />
        </div>
        <Button variant="secondary" icon={<Volume2 className="size-4" />} onClick={() => play([{ text: 'Hello! This is how I sound. Is this speed comfortable for you?' }], { rate: 0.95, waitMs: 20_000 })}>
          Test voice
        </Button>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={recordingAvailable() ? 'success' : 'neutral'}>Microphone recording: {recordingAvailable() ? 'available' : 'not available'}</Badge>
          <Badge tone={recognitionAvailable() ? 'success' : 'neutral'}>Speech recognition: {recognitionAvailable() ? 'available' : 'not available'}</Badge>
        </div>
      </Card>

      <Card className="space-y-2">
        <SectionTitle>AI features</SectionTitle>
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          {status?.ai.available ? (
            <span>
              On — using <strong>{status.ai.model}</strong>.
            </span>
          ) : (
            <span>Off. The whole course works without AI.</span>
          )}
        </div>
        <p className="text-sm text-muted">
          AI adds free conversation, full writing and speaking feedback and a tutor that can explain anything. To enable it, put <code>ANTHROPIC_API_KEY=…</code> in the <code>.env</code> file
          and restart the app.
        </p>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Placement</SectionTitle>
        <p className="text-sm text-muted">Retake the placement test to refresh your skill estimates. Your progress and words are kept.</p>
        <Link to="/placement" className="text-sm font-semibold text-primary">
          Take the placement test →
        </Link>
      </Card>

      <Card>
        <SectionTitle>Password</SectionTitle>
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />}</Field>
          <Field label="New password" hint="At least 8 characters">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Change password</Button>
            {pwMsg && <span className="ml-3 text-sm">{pwMsg}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
