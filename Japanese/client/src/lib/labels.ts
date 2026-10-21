import type { Lang } from '../i18n';

const CATEGORY: Record<string, [string, string]> = {
  kana: ['Кана үсэг', 'Kana'],
  vocabulary: ['Үгсийн сан', 'Vocabulary'],
  'kanji-reading': ['Ханзны уншлага', 'Kanji reading'],
  'kanji-meaning': ['Ханзны утга', 'Kanji meaning'],
  grammar: ['Дүрэм', 'Grammar'],
  particles: ['Нөхцөл (助詞)', 'Particles'],
  verbs: ['Үйл үгийн хэлбэр', 'Verb forms'],
  adjectives: ['Тэмдэг нэр', 'Adjectives'],
  numbers: ['Тоо, цаг, огноо', 'Numbers & time'],
  reading: ['Уншиж ойлгох', 'Reading'],
  listening: ['Сонсгол', 'Listening'],
  translation: ['Орчуулга', 'Translation'],
};

/** Where to practise a weak category. */
export const CATEGORY_PAGE: Record<string, string> = {
  kana: '/hiragana',
  vocabulary: '/vocabulary',
  'kanji-reading': '/kanji',
  'kanji-meaning': '/kanji',
  grammar: '/grammar',
  particles: '/grammar',
  verbs: '/grammar',
  adjectives: '/grammar',
  numbers: '/grammar',
  reading: '/stories',
  listening: '/listening',
  translation: '/translation',
};

const SECTION: Record<string, [string, string]> = {
  vocabulary: ['Үг, ханз (文字・語彙)', 'Vocabulary (文字・語彙)'],
  grammar: ['Дүрэм (文法)', 'Grammar (文法)'],
  reading: ['Уншлага (読解)', 'Reading (読解)'],
  listening: ['Сонсгол (聴解)', 'Listening (聴解)'],
};

const POS: Record<string, [string, string]> = {
  noun: ['нэр үг', 'noun'],
  pronoun: ['төлөөний үг', 'pronoun'],
  verb1: ['үйл үг · I', 'verb · group 1'],
  verb2: ['үйл үг · II', 'verb · group 2'],
  verb3: ['үйл үг · III', 'verb · irregular'],
  'i-adj': ['い тэмдэг нэр', 'い-adjective'],
  'na-adj': ['な тэмдэг нэр', 'な-adjective'],
  adverb: ['дайвар үг', 'adverb'],
  expression: ['хэллэг', 'expression'],
  question: ['асуух үг', 'question word'],
  number: ['тоо', 'number'],
  counter: ['тоолох дагавар', 'counter'],
  suffix: ['дагавар', 'suffix'],
  prenoun: ['тодотгол үг', 'pre-noun'],
  conjunction: ['холбоос үг', 'conjunction'],
};

const STATE: Record<string, [string, string]> = {
  new: ['Шинэ', 'New'],
  learning: ['Сурч буй', 'Learning'],
  review: ['Давтах', 'Review'],
  mastered: ['Эзэмшсэн', 'Mastered'],
};

const pickLang = (map: Record<string, [string, string]>, key: string, lang: Lang) => map[key]?.[lang === 'en' ? 1 : 0] ?? key;

export const categoryLabel = (key: string, lang: Lang) => pickLang(CATEGORY, key, lang);
export const sectionLabel = (key: string, lang: Lang) => pickLang(SECTION, key, lang);
export const posLabel = (key: string, lang: Lang) => pickLang(POS, key, lang);
export const stateLabel = (key: string, lang: Lang) => pickLang(STATE, key, lang);
