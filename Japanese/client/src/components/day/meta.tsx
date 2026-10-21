import type { ReactNode } from 'react';
import { BookOpen, ClipboardCheck, Gamepad2, Headphones, Layers, MessagesSquare, Mic, RotateCcw, ScrollText } from 'lucide-react';
import type { StepKind } from '../../api/types';
import { cx } from '../ui';

const glyph = (c: string) => <span className="jp text-[15px] font-bold leading-none">{c}</span>;

export const STEP_META: Record<StepKind, { icon: ReactNode; tone: string; mn: string; en: string }> = {
  review: { icon: <RotateCcw className="size-5" />, tone: 'bg-ai-soft text-ai', mn: 'Давталт', en: 'Review' },
  kana: { icon: glyph('あ'), tone: 'bg-shu-soft text-shu', mn: 'Үсэг', en: 'Kana' },
  words: { icon: <Layers className="size-5" />, tone: 'bg-shu-soft text-shu', mn: 'Шинэ үг', en: 'New words' },
  kanji: { icon: glyph('漢'), tone: 'bg-shu-soft text-shu', mn: 'Ханз', en: 'Kanji' },
  grammar: { icon: <BookOpen className="size-5" />, tone: 'bg-matcha-soft text-matcha', mn: 'Дүрэм', en: 'Grammar' },
  dialogue: { icon: <MessagesSquare className="size-5" />, tone: 'bg-yamabuki-soft text-yamabuki', mn: 'Яриа', en: 'Dialogue' },
  reading: { icon: <ScrollText className="size-5" />, tone: 'bg-yamabuki-soft text-yamabuki', mn: 'Уншлага', en: 'Reading' },
  listening: { icon: <Headphones className="size-5" />, tone: 'bg-ai-soft text-ai', mn: 'Сонсгол', en: 'Listening' },
  speaking: { icon: <Mic className="size-5" />, tone: 'bg-ai-soft text-ai', mn: 'Ярих', en: 'Speaking' },
  game: { icon: <Gamepad2 className="size-5" />, tone: 'bg-yamabuki-soft text-yamabuki', mn: 'Тоглоом', en: 'Game' },
  quiz: { icon: <ClipboardCheck className="size-5" />, tone: 'bg-matcha-soft text-matcha', mn: 'Шалгалт', en: 'Quiz' },
};

export function StepIcon({ kind, done, className }: { kind: StepKind; done?: boolean; className?: string }) {
  const meta = STEP_META[kind];
  return <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', done ? 'bg-matcha text-white' : meta.tone, className)}>{meta.icon}</span>;
}

export const LEVEL_LABEL: Record<string, string> = { N5: 'N5 · Анхан', N4: 'N4 · Суурь', N3: 'N3 · Дунд', N2: 'N2 · Ахисан' };
