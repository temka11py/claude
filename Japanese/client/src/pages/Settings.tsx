import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Flame, LogOut, Moon, Sun, Volume2 } from 'lucide-react';
import { patch } from '../api/client';
import type { User } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { hasJapaneseVoice, speak, ttsSupported } from '../lib/speech';
import { Avatar } from '../components/AppShell';
import { Button, Card, PageHeader, ProgressBar, Segmented, SectionTitle, Toggle, cx } from '../components/ui';

export default function Settings() {
  const { user, settings, updateSettings, logout, setUser } = useAuth();
  const { L } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const avatars = useApi<{ avatars: string[] }>('/auth/avatars');
  const progress = useApi<{ totals: { lessonsCompleted: number; lessonsTotal: number; vocabLearned: number; kanjiLearned: number } }>('/progress');
  if (!user) return null;

  const saveProfile = async (patchData: { name?: string; avatar?: string }) => {
    setSaving(true);
    try {
      const r = await patch<{ user: User }>('/auth/profile', patchData);
      setUser(r.user);
      notify({ kind: 'info', title: L('Хадгаллаа', 'Saved') });
    } catch {
      notify({ kind: 'error', title: L('Хадгалж чадсангүй', 'Could not save') });
    } finally {
      setSaving(false);
    }
  };

  const t = progress.data?.totals;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader titleJa="せってい" title={L('Тохиргоо', 'Settings')} />

      <Card>
        <SectionTitle>{L('Профайл', 'Profile')}</SectionTitle>
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <Avatar char={user.avatar} className="size-20 text-4xl" />
            <span className="flex items-center gap-1 text-sm font-medium text-shu">
              <Flame className="size-4" />
              {user.streak} {L('өдрийн цуваа', 'day streak')}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{L('Нэр', 'Name')}</span>
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-ink outline-none focus:border-shu" />
                <Button variant="secondary" loading={saving} disabled={!name.trim() || name === user.name} onClick={() => saveProfile({ name: name.trim() })}>
                  {L('Хадгалах', 'Save')}
                </Button>
              </div>
            </label>
            <div>
              <span className="text-sm font-medium text-ink">{L('Имэйл', 'Email')}</span>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">{L('Аватар', 'Avatar')}</span>
              <div className="flex flex-wrap gap-2">
                {avatars.data?.avatars.map((a) => (
                  <button key={a} onClick={() => saveProfile({ avatar: a })} aria-pressed={a === user.avatar} className={cx('rounded-full ring-2 ring-offset-2 ring-offset-surface transition', a === user.avatar ? 'ring-shu' : 'ring-transparent hover:ring-line')}>
                    <Avatar char={a} className="size-10 text-lg" />
                  </button>
                ))}
              </div>
            </div>
            {t && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="mb-1 text-xs text-muted">{L('Хичээл', 'Lessons')}</p>
                  <ProgressBar value={t.lessonsCompleted} max={t.lessonsTotal} />
                  <p className="mt-1 text-xs tabular-nums text-ink-2">
                    {t.lessonsCompleted}/{t.lessonsTotal}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">{L('Үг', 'Words')}</p>
                  <p className="text-lg font-semibold text-ink">{t.vocabLearned}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">{L('Ханз', 'Kanji')}</p>
                  <p className="text-lg font-semibold text-ink">{t.kanjiLearned}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>{L('Хэл ба харагдах байдал', 'Language & appearance')}</SectionTitle>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{L('Интерфэйсийн хэл', 'Interface language')}</p>
              <Segmented
                value={settings.language}
                onChange={(v) => updateSettings({ language: v })}
                options={[
                  { value: 'mn', label: 'Монгол' },
                  { value: 'en', label: 'English' },
                ]}
              />
              <p className="mt-1.5 text-xs text-muted">{L('Хичээлийн тайлбар монгол хэлээр хэвээр үлдэнэ.', 'Lesson explanations stay in Mongolian.')}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink">{L('Загвар', 'Theme')}</p>
              <Segmented
                value={settings.theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  { value: 'light', label: <span className="flex items-center gap-1.5"><Sun className="size-4" />{L('Цайвар', 'Light')}</span> },
                  { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon className="size-4" />{L('Харанхуй', 'Dark')}</span> },
                ]}
              />
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>{L('Суралцах тохиргоо', 'Learning preferences')}</SectionTitle>
          <div className="divide-y divide-line">
            <Toggle checked={settings.showRomaji} onChange={(v) => updateSettings({ showRomaji: v })} label={L('Ромаджи харуулах', 'Show romaji')} description={L('Үгийн доор латин үсгээр бичнэ.', 'Latin transcription under words.')} />
            <Toggle checked={settings.showFurigana} onChange={(v) => updateSettings({ showFurigana: v })} label={L('Фуригана харуулах', 'Show furigana')} description={L('Ханзын дээр жижиг хирагана.', 'Small hiragana above kanji.')} />
            <div className="py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{L('Өдрийн зорилго', 'Daily goal')}</span>
                <span className="text-sm tabular-nums text-muted">
                  {settings.dailyGoalMinutes} {L('мин', 'min')}
                </span>
              </div>
              <Segmented value={String(settings.dailyGoalMinutes)} onChange={(v) => updateSettings({ dailyGoalMinutes: Number(v) })} options={['10', '15', '25', '40', '60'].map((v) => ({ value: v, label: v }))} />
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>{L('Дуу', 'Audio')}</SectionTitle>
          <div className="divide-y divide-line">
            <Toggle checked={settings.autoplayAudio} onChange={(v) => updateSettings({ autoplayAudio: v })} label={L('Автоматаар тоглуулах', 'Autoplay')} description={L('Сонсголын асуулт нээгдэхэд шууд тоглуулна.', 'Play listening questions automatically.')} />
            <div className="py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{L('Ярианы хурд', 'Speech speed')}</span>
                <span className="text-sm tabular-nums text-muted">{settings.speechRate.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.3}
                step={0.05}
                value={settings.speechRate}
                onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })}
                className="w-full accent-[var(--shu)]"
                aria-label={L('Ярианы хурд', 'Speech speed')}
              />
              <Button variant="secondary" size="sm" className="mt-2" disabled={!ttsSupported} onClick={() => speak('こんにちは。日本語を勉強しましょう。', settings.speechRate)}>
                <Volume2 className="size-4" />
                {L('Туршиж сонсох', 'Test voice')}
              </Button>
              {ttsSupported && !hasJapaneseVoice() && <p className="mt-2 text-xs text-yamabuki">{L('Таны төхөөрөмжид япон хэлний дуу хоолой суулгаагүй байж магадгүй. Системийн тохиргооноос Japanese voice нэмнэ үү.', 'No Japanese voice may be installed on this device. Add one in your system speech settings.')}</p>}
              {!ttsSupported && <p className="mt-2 text-xs text-yamabuki">{L('Энэ хөтөч дуу гаргах боломжгүй.', 'This browser cannot synthesize speech.')}</p>}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-4">
          <div>
            <SectionTitle>{L('Бүртгэл', 'Account')}</SectionTitle>
            <p className="text-sm text-muted">{L('Нууц үг шифрлэгдсэн (bcrypt) хэлбэрээр хадгалагддаг.', 'Your password is stored hashed (bcrypt).')}</p>
            <p className="mt-2 text-xs text-muted">
              {L('Зураасны дарааллын өгөгдөл', 'Stroke-order data')}: <a className="text-ai hover:underline" href="https://kanjivg.tagaini.net" target="_blank" rel="noreferrer">KanjiVG</a> (CC BY-SA 3.0)
            </p>
          </div>
          <Button
            variant="danger"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut className="size-4" />
            {L('Гарах', 'Log out')}
          </Button>
        </Card>
      </div>
    </div>
  );
}
