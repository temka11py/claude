import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { parseJson } from './json.js';

export type ItemType = 'vocab' | 'kanji' | 'grammar' | 'kana';
export const ITEM_TYPES: ItemType[] = ['vocab', 'kanji', 'grammar', 'kana'];

const FK: Record<ItemType, 'vocabularyId' | 'kanjiId' | 'grammarId' | 'kanaId'> = {
  vocab: 'vocabularyId',
  kanji: 'kanjiId',
  grammar: 'grammarId',
  kana: 'kanaId',
};

export const itemKey = (type: ItemType, id: number) => `${type}:${id}`;

/** Add items to the learner's review deck (existing cards are left untouched). */
export async function ensureReviewItems(userId: string, items: { type: ItemType; id: number }[]) {
  if (items.length === 0) return 0;
  const keys = items.map((i) => itemKey(i.type, i.id));
  const existing = await prisma.reviewItem.findMany({ where: { userId, key: { in: keys } }, select: { key: true } });
  const have = new Set(existing.map((e) => e.key));
  const seen = new Set<string>();
  const data = items
    .filter((i) => {
      const key = itemKey(i.type, i.id);
      if (have.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((i) => ({ userId, key: itemKey(i.type, i.id), itemType: i.type, [FK[i.type]]: i.id }));
  if (data.length) await prisma.reviewItem.createMany({ data });
  return data.length;
}

export async function assertItemExists(type: ItemType, id: number): Promise<boolean> {
  switch (type) {
    case 'vocab':
      return !!(await prisma.vocabulary.findUnique({ where: { id }, select: { id: true } }));
    case 'kanji':
      return !!(await prisma.kanji.findUnique({ where: { id }, select: { id: true } }));
    case 'grammar':
      return !!(await prisma.grammar.findUnique({ where: { id }, select: { id: true } }));
    case 'kana':
      return !!(await prisma.kana.findUnique({ where: { id }, select: { id: true } }));
  }
}

export const reviewInclude = {
  vocabulary: true,
  kanji: true,
  grammar: { select: { id: true, slug: true, title: true, meaning: true, structure: true, examples: true } },
  kana: true,
} as const;

type ReviewRow = Prisma.ReviewItemGetPayload<{ include: typeof reviewInclude }>;

/** Flatten a review item into a front/back flashcard. */
export function toCard(item: ReviewRow) {
  const base = {
    id: item.id,
    key: item.key,
    itemType: item.itemType,
    state: item.state,
    dueAt: item.dueAt,
    intervalDays: item.intervalDays,
    reps: item.reps,
    lapses: item.lapses,
    ease: item.ease,
    step: item.step,
  };
  if (item.vocabulary) {
    const v = item.vocabulary;
    return { ...base, itemId: v.id, front: v.word, reading: v.kana, romaji: v.romaji, meaning: v.meaning, meaningEn: v.meaningEn, extra: v.partOfSpeech, example: v.example, exampleMn: v.exampleMn, speak: v.kana };
  }
  if (item.kanji) {
    const k = item.kanji;
    const ex = parseJson<{ word: string; reading: string; meaning: string }[]>(k.examples, []);
    return { ...base, itemId: k.id, front: k.char, reading: [k.onyomi, k.kunyomi].filter(Boolean).join(' / '), romaji: '', meaning: k.meaning, meaningEn: k.meaningEn, extra: `${k.strokes}`, example: ex[0] ? `${ex[0].word}（${ex[0].reading}）` : '', exampleMn: ex[0]?.meaning ?? '', speak: ex[0]?.reading ?? k.char };
  }
  if (item.grammar) {
    const g = item.grammar;
    const ex = parseJson<{ ja: string; mn: string }[]>(g.examples, []);
    return { ...base, itemId: g.id, front: g.title, reading: g.structure, romaji: '', meaning: g.meaning, meaningEn: '', extra: g.slug, example: ex[0]?.ja ?? '', exampleMn: ex[0]?.mn ?? '', speak: ex[0]?.ja ?? '' };
  }
  if (item.kana) {
    const k = item.kana;
    return { ...base, itemId: k.id, front: k.char, reading: k.romaji.split('|')[0], romaji: k.romaji.split('|')[0], meaning: `${k.example}（${k.exampleReading}）— ${k.exampleMeaning}`, meaningEn: '', extra: k.script, example: k.example, exampleMn: k.exampleMeaning, speak: k.char };
  }
  return { ...base, itemId: 0, front: '?', reading: '', romaji: '', meaning: '', meaningEn: '', extra: '', example: '', exampleMn: '', speak: '' };
}
