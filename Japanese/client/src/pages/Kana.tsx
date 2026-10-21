import { useState } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import type { Kana } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Button, Card, ErrorState, PageHeader, Segmented, Spinner, cx } from '../components/ui';
import { KanaCell, KanaDetail, romajiOf } from '../components/kana';
import { PracticeRunner } from '../components/quiz/runners';

const VOWELS = ['a', 'i', 'u', 'e', 'o'];

function column(k: Kana): number {
  const r = romajiOf(k);
  if (r === 'n') return 0;
  return VOWELS.indexOf(r[r.length - 1]);
}

/** Lay characters out in the traditional gojūon grid (rows × vowels). */
function GojuonGrid({ items, onSelect, cols = 5 }: { items: Kana[]; onSelect: (k: Kana) => void; cols?: 3 | 5 }) {
  // ん shares the わ row in the data but sits on its own line in the chart.
  const rowOf = (k: Kana) => (romajiOf(k) === 'n' ? 'n' : k.row);
  const rows: string[] = [];
  for (const k of items) if (!rows.includes(rowOf(k))) rows.push(rowOf(k));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const cells: (Kana | null)[] = Array(cols).fill(null);
        for (const k of items.filter((x) => rowOf(x) === row)) {
          const c = cols === 3 ? ['a', 'u', 'o'].indexOf(romajiOf(k).slice(-1)) : column(k);
          if (c >= 0) cells[c] = k;
        }
        return (
          <div key={row} className={cx('grid gap-2', cols === 3 ? 'grid-cols-3' : 'grid-cols-5')}>
            {cells.map((k, i) => (k ? <KanaCell key={k.id} k={k} onSelect={onSelect} /> : <div key={i} className="rounded-2xl border border-dashed border-line/60" />))}
          </div>
        );
      })}
    </div>
  );
}

type Mode = 'c2s' | 's2c' | 'type';

export default function KanaPage({ script }: { script: 'hiragana' | 'katakana' }) {
  const { L } = useI18n();
  const { data, error, loading, reload } = useApi<{ kana: Kana[] }>(`/kana?script=${script}`);
  const [tab, setTab] = useState<'chart' | 'practice'>('chart');
  const [selected, setSelected] = useState<Kana | null>(null);
  const [modes, setModes] = useState<Mode[]>(['c2s', 's2c']);
  const [groups, setGroups] = useState<string[]>(['basic']);
  const [count, setCount] = useState('10');
  const [session, setSession] = useState<string | null>(null);

  const title = script === 'hiragana' ? L('Хирагана', 'Hiragana') : L('Катакана', 'Katakana');
  const titleJa = script === 'hiragana' ? 'ひらがな' : 'カタカナ';

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const by = (g: string[]) => data.kana.filter((k) => g.includes(k.group));
  const groupOptions = [
    { value: 'basic', label: L('Үндсэн', 'Basic') },
    { value: 'dakuten', label: L('Дакүтэн ゛', 'Dakuten ゛') },
    { value: 'handakuten', label: L('Хандакүтэн ゜', 'Handakuten ゜') },
    { value: 'yoon', label: L('Нийлмэл (ゃゅょ)', 'Combos (ゃゅょ)') },
    ...(script === 'katakana' ? [{ value: 'extended', label: L('Тусгай (ティ, ファ…)', 'Extended (ティ, ファ…)') }] : [{ value: 'long', label: L('Урт эгшиг', 'Long vowels') }]),
  ];
  const modeOptions: { value: Mode; label: string }[] = [
    { value: 'c2s', label: L('Үсэг → авиа', 'Character → sound') },
    { value: 's2c', label: L('Авиа → үсэг', 'Sound → character') },
    { value: 'type', label: L('Бичиж хариулах', 'Typing') },
  ];
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const prefixes = groups.flatMap((g) => modes.map((m) => `kana-${script}-${g}-${m}`)).join(',');

  return (
    <div>
      <PageHeader
        titleJa={titleJa}
        title={title}
        subtitle={
          script === 'hiragana'
            ? L('Япон хэлний үндсэн авиа зүйн цагаан толгой. Үсэг дээр дарж дуудлага, жишээ, зураасны дарааллыг хараарай.', 'The core Japanese syllabary. Tap a character for its sound, an example and stroke order.')
            : L('Гадаад үг, нэр бичихэд хэрэглэгддэг. Хираганатай ижил авиатай.', 'Used for loanwords and foreign names. Same sounds as hiragana.')
        }
        actions={
          <Segmented
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSession(null);
            }}
            options={[
              { value: 'chart', label: L('Хүснэгт', 'Chart') },
              { value: 'practice', label: L('Дасгал', 'Practice') },
            ]}
          />
        }
      />

      {tab === 'chart' ? (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 font-semibold text-ink">{L('Үндсэн үсэг (46)', 'Basic characters (46)')}</h2>
            <div className="max-w-2xl">
              <GojuonGrid items={by(['basic'])} onSelect={setSelected} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-ink">{L('Дакүтэн ゛ ба хандакүтэн ゜', 'Dakuten ゛ & handakuten ゜')}</h2>
            <div className="max-w-2xl">
              <GojuonGrid items={by(['dakuten', 'handakuten'])} onSelect={setSelected} />
            </div>
          </section>
          <section>
            <h2 className="mb-1 font-semibold text-ink">{L('Нийлмэл үе (拗音)', 'Combined sounds (拗音)')}</h2>
            <p className="mb-3 text-sm text-muted">{L('い мөрийн үсэг + жижиг ゃ ゅ ょ', 'An i-row character + small ゃ ゅ ょ')}</p>
            <div className="max-w-md">
              <GojuonGrid items={by(['yoon'])} onSelect={setSelected} cols={3} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-ink">{script === 'hiragana' ? L('Жижиг っ ба урт эгшиг', 'Small っ & long vowels') : L('Тусгай хослол, ッ ба ー', 'Extended combinations, ッ & ー')}</h2>
            <div className="grid max-w-2xl grid-cols-3 gap-2 sm:grid-cols-5">
              {by(['sokuon', 'long', 'extended']).map((k) => (
                <KanaCell key={k.id} k={k} onSelect={setSelected} />
              ))}
            </div>
          </section>
        </div>
      ) : session ? (
        <div>
          <Button variant="ghost" size="sm" className="mb-3" onClick={() => setSession(null)}>
            <ArrowLeft className="size-4" />
            {L('Тохиргоо руу буцах', 'Back to setup')}
          </Button>
          <PracticeRunner query={session} kind="kana" title={`${title} — ${L('дасгал', 'practice')}`} />
        </div>
      ) : (
        <Card className="flex max-w-2xl flex-col gap-5">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{L('Дасгалын төрөл', 'Quiz type')}</p>
            <div className="flex flex-wrap gap-2">
              {modeOptions.map((m) => (
                <button key={m.value} onClick={() => setModes((x) => toggle(x, m.value))} className={cx('rounded-xl border px-3.5 py-2 text-sm font-medium', modes.includes(m.value) ? 'border-shu bg-shu-soft text-shu' : 'border-line text-ink-2 hover:bg-surface-2')} aria-pressed={modes.includes(m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{L('Үсгийн бүлэг', 'Character groups')}</p>
            <div className="flex flex-wrap gap-2">
              {groupOptions.map((g) => (
                <button key={g.value} onClick={() => setGroups((x) => toggle(x, g.value))} className={cx('rounded-xl border px-3.5 py-2 text-sm font-medium', groups.includes(g.value) ? 'border-ai bg-ai-soft text-ai' : 'border-line text-ink-2 hover:bg-surface-2')} aria-pressed={groups.includes(g.value)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{L('Асуултын тоо', 'Number of questions')}</p>
            <Segmented value={count} onChange={setCount} options={['10', '20', '30'].map((v) => ({ value: v, label: v }))} />
          </div>
          <Button size="lg" disabled={!modes.length || !groups.length} onClick={() => setSession(`prefix=${prefixes}&count=${count}`)}>
            <Play className="size-4" />
            {L('Дасгал эхлэх', 'Start practice')}
          </Button>
        </Card>
      )}
      <KanaDetail k={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
