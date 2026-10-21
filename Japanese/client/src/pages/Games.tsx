import { useMemo, useState } from 'react';
import { Grid3x3, Shuffle } from 'lucide-react';
import { post } from '../api/client';
import type { Achievement, Vocab } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../i18n';
import { Button, Card, EmptyState, PageHeader, Segmented, Spinner } from '../components/ui';
import { MatchGame, Sudoku } from '../components/day/games';

const SYMBOL_SETS: Record<string, { mn: string; en: string; symbols: string[]; hints: string[] }> = {
  kanji: { mn: 'Ханзан тоо', en: 'Kanji numbers', symbols: ['一', '二', '三', '四', '五', '六', '七', '八', '九'], hints: ['いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'] },
  hiragana: { mn: 'Хирагана', en: 'Hiragana', symbols: ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け'], hints: ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke'] },
  katakana: { mn: 'Катакана', en: 'Katakana', symbols: ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ'], hints: ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke'] },
  days: { mn: 'Гараг', en: 'Weekdays', symbols: ['月', '火', '水', '木', '金', '土', '日', '年', '時'], hints: ['げつ', 'か', 'すい', 'もく', 'きん', 'ど', 'にち', 'ねん', 'じ'] },
};

function useXp() {
  const { celebrate } = useToast();
  const { lang } = useI18n();
  return (amount: number) =>
    post<{ achievements: Achievement[] }>('/xp', { source: 'game', amount })
      .then((r) => celebrate(r.achievements, lang))
      .catch(() => undefined);
}

function SudokuGame() {
  const { L, lang } = useI18n();
  const [size, setSize] = useState<'4' | '6' | '9'>('6');
  const [set, setSet] = useState('kanji');
  const [round, setRound] = useState(0);
  const award = useXp();
  const n = Number(size) as 4 | 6 | 9;
  const s = SYMBOL_SETS[set];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={size} onChange={(v) => setSize(v)} options={[{ value: '4', label: '4×4' }, { value: '6', label: '6×6' }, { value: '9', label: '9×9' }]} />
        <Segmented size="sm" value={set} onChange={setSet} options={Object.entries(SYMBOL_SETS).map(([k, v]) => ({ value: k, label: lang === 'en' ? v.en : v.mn }))} />
        <Button size="sm" variant="ghost" onClick={() => setRound((r) => r + 1)}>
          <Shuffle className="size-4" />
          {L('Шинэ', 'New')}
        </Button>
      </div>
      <Sudoku key={`${size}-${set}-${round}`} size={n} symbols={s.symbols.slice(0, n)} hints={s.hints.slice(0, n)} onSolved={() => void award(n === 4 ? 5 : n === 6 ? 10 : 20)} />
    </div>
  );
}

function WordMatch() {
  const { L } = useI18n();
  const award = useXp();
  const { data, loading } = useApi<{ cards: Vocab[] }>('/flashcards?deck=learned');
  const [round, setRound] = useState(0);
  const pairs = useMemo(() => {
    const cards = [...(data?.cards ?? [])].sort(() => Math.random() - 0.5).slice(0, 6);
    return cards.map((v) => ({ id: String(v.id), left: v.word, right: v.meaning }));
  }, [data, round]);
  if (loading && !data) return <Spinner />;
  if (pairs.length < 3) return <EmptyState title={L('Сурсан үг хараахан цөөн байна', 'Not enough learned words yet')} body={L('Өдрийн хөтөлбөрийн "Шинэ үг" алхмуудыг хийсний дараа энд тоглоно.', 'Finish a few “New words” steps in the program first.')} />;
  return (
    <div className="flex flex-col gap-3">
      <MatchGame key={round} pairs={pairs} onDone={() => void award(5)} />
      <Button variant="secondary" className="self-start" onClick={() => setRound((r) => r + 1)}>
        <Shuffle className="size-4" />
        {L('Өөр үгс', 'New words')}
      </Button>
    </div>
  );
}

export default function Games() {
  const { L } = useI18n();
  const [tab, setTab] = useState<'sudoku' | 'match'>('sudoku');
  return (
    <div>
      <PageHeader title={L('Тоглоом', 'Games')} titleJa="あそび" subtitle={L('Тоглож байгаад сурцгаая: ханзан тоо, кана судоку ба үг холбох. Тоглоом бүр XP өгнө.', 'Learn while you play: kanji-number and kana sudoku, word matching. Every game earns XP.')} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sudoku', label: L('Судоку', 'Sudoku') },
          { value: 'match', label: L('Үг холбох', 'Word match') },
        ]}
      />
      <Card className="mt-4">
        {tab === 'sudoku' ? <SudokuGame /> : <WordMatch />}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Grid3x3 className="size-3.5" />
        {L('Судоку: доорх тэмдэгтийн доор уншлага нь бичээстэй — тоглох зуураа ханзны уншлагыг цээжилнэ.', 'Sudoku: each symbol shows its reading, so you memorise readings while you play.')}
      </p>
    </div>
  );
}
