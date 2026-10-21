import { useState } from 'react';
import type { Kana } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { Modal, SpeakButton, cx } from './ui';
import { WritingPractice } from './writing';

export const romajiOf = (k: Pick<Kana, 'romaji'>) => k.romaji.split('|')[0].replace(/^\((double|long)\)$/, '');

export function KanaCell({ k, onSelect, small }: { k: Kana; onSelect: (k: Kana) => void; small?: boolean }) {
  const { settings } = useAuth();
  return (
    <button
      onClick={() => onSelect(k)}
      className={cx(
        'group relative flex flex-col items-center justify-center rounded-2xl border border-line bg-surface transition-colors hover:border-shu hover:bg-shu-soft/40',
        small ? 'h-20' : 'h-24 sm:h-28',
      )}
      aria-label={`${k.char} ${romajiOf(k)}`}
    >
      {k.state && <span className={cx('absolute right-2 top-2 size-1.5 rounded-full', k.state === 'mastered' ? 'bg-matcha' : k.state === 'review' ? 'bg-ai' : 'bg-yamabuki')} />}
      <span className={cx('brush leading-none text-ink group-hover:text-shu', k.char.length > 1 ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl')}>{k.char}</span>
      {settings.showRomaji && <span className="mt-1.5 text-xs font-medium text-muted">{romajiOf(k)}</span>}
    </button>
  );
}

export function KanaDetail({ k, onClose }: { k: Kana | null; onClose: () => void }) {
  const { L } = useI18n();
  const [tab, setTab] = useState<'info' | 'write'>('info');
  if (!k) return null;
  return (
    <Modal open={!!k} onClose={onClose} wide title={<span className="text-muted">{k.script === 'hiragana' ? L('Хирагана', 'Hiragana') : L('Катакана', 'Katakana')}</span>}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-5">
          <span className="brush grid size-28 shrink-0 place-items-center rounded-3xl bg-shu-soft text-6xl text-shu">{k.char}</span>
          <div className="min-w-0">
            <p className="text-3xl font-semibold text-ink">{romajiOf(k) || '—'}</p>
            {k.romaji.includes('|') && <p className="text-xs text-muted">{L('Бусад бичлэг', 'Also typed')}: {k.romaji.split('|').slice(1).join(', ')}</p>}
            <div className="mt-2">
              <SpeakButton text={k.char === 'ー' || k.char === 'っ' || k.char === 'ッ' ? k.exampleReading : k.char} label={L('Дуудлага', 'Pronounce')} />
            </div>
          </div>
        </div>
        <div className="flex gap-1 border-b border-line">
          {(['info', 'write'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t ? 'border-shu text-shu' : 'border-transparent text-muted hover:text-ink')}>
              {t === 'info' ? L('Мэдээлэл', 'Info') : L('Бичих дасгал', 'Writing')}
            </button>
          ))}
        </div>
        {tab === 'info' ? (
          <div className="flex flex-col gap-3">
            {k.note && <p className="rounded-xl bg-ai-soft px-4 py-3 text-sm text-ai">{k.note}</p>}
            {k.example && k.example !== k.char && (
              <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
                <SpeakButton text={k.exampleReading} size="sm" />
                <div>
                  <p className="jp text-2xl text-ink">{k.example}</p>
                  <p className="text-sm text-muted">
                    <span className="jp">{k.exampleReading}</span> — {k.exampleMeaning}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <WritingPractice text={k.char} />
        )}
      </div>
    </Modal>
  );
}
