import { findWordForm } from '@shared/text';
import type { Word } from '../../lib/types';
import { Badge, Callout, LevelBadge, Mn, SpeakButton, clsx } from '../ui';

const STATE_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent'> = {
  NEW: 'neutral',
  LEARNING: 'primary',
  FAMILIAR: 'accent',
  MASTERED: 'success',
  REVIEW: 'danger',
};

export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONE[state] ?? 'neutral'}>{state.charAt(0) + state.slice(1).toLowerCase()}</Badge>;
}

/** Highlight the word (in any form) inside an example sentence. */
export function Highlighted({ text, word }: { text: string; word: string }) {
  const form = findWordForm(text, word);
  if (!form) return <>{text}</>;
  const i = text.toLowerCase().indexOf(form.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="word-hl font-semibold">{text.slice(i, i + form.length)}</mark>
      {text.slice(i + form.length)}
    </>
  );
}

type WordLike = Pick<Word, 'word' | 'pos' | 'ipa' | 'definition' | 'mongolian' | 'examples' | 'collocations' | 'synonyms' | 'antonyms' | 'mistake' | 'note' | 'level'> & {
  progress?: Word['progress'];
  personalNote?: string | null;
};

/** The full "word + pronunciation + meaning + example + collocation + mistake + context" card. */
export function WordCard({ word: w, compact, className }: { word: WordLike; compact?: boolean; className?: string }) {
  return (
    <article className={clsx('rounded-2xl bg-surface p-5 ring-1 ring-border', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-bold tracking-tight">{w.word}</h3>
            <SpeakButton text={w.word} size="sm" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            {w.pos && <span className="italic">{w.pos}</span>}
            {w.ipa && <span className="font-mono text-[13px]">{w.ipa}</span>}
            <LevelBadge level={w.level} />
            {w.progress && <StateBadge state={w.progress.state} />}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[16px] leading-relaxed">{w.definition}</p>
      {w.mongolian && (
        <div className="mt-1">
          <Mn>{w.mongolian}</Mn>
        </div>
      )}

      {w.examples.length > 0 && (
        <ul className="mt-3 space-y-2">
          {(compact ? w.examples.slice(0, 1) : w.examples).map((ex, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[15px]">
              <span className="min-w-0 flex-1">
                <Highlighted text={ex} word={w.word} />
              </span>
              <SpeakButton text={ex} size="sm" label="Listen to the example" />
            </li>
          ))}
        </ul>
      )}

      {!compact && w.collocations.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Collocations</div>
          <div className="flex flex-wrap gap-1.5">
            {w.collocations.map((c) => (
              <span key={c} className="rounded-lg bg-primary-soft px-2.5 py-1 text-sm font-medium text-primary">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {!compact && (w.synonyms.length > 0 || w.antonyms.length > 0) && (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {w.synonyms.length > 0 && (
            <div>
              <span className="font-semibold text-muted">Similar: </span>
              {w.synonyms.join(', ')}
            </div>
          )}
          {w.antonyms.length > 0 && (
            <div>
              <span className="font-semibold text-muted">Opposite: </span>
              {w.antonyms.join(', ')}
            </div>
          )}
        </div>
      )}

      {!compact && w.mistake && (
        <div className="mt-3">
          <Callout kind="warning" title="Common mistake">
            {w.mistake}
          </Callout>
        </div>
      )}
      {!compact && w.note && <p className="mt-3 text-sm text-muted">💡 {w.note}</p>}
      {w.personalNote && <p className="mt-3 text-sm">📝 {w.personalNote}</p>}
    </article>
  );
}
