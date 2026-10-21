# Writing N4 → N2 days

Hanamaru teaches Japanese to a **Mongolian speaker**. All explanations are in Mongolian Cyrillic. The Japanese must be natural, correct and at the level of the day. Each day has one topic, and the app splits it into short steps of 2–5 minutes: words, kanji, grammar, dialogue, reading, listening, speaking, game and quiz.

## Your file

Each outline unit has its own file: `nX-uYY.ts`, which exports `NX_UYY: LevelDayContent[]`. The days of a unit, and their planned grammar points, are in `../program-outline.ts`. Units are numbered per level in the order they appear there.

- Write **every day of your unit, in order**. Each day's `slug` must be the outline slug (`n3-007`, …).
- Edit **only your own file**. Do not run the seed and do not touch the database.
- Use `n4-u01.ts` as the reference. Copy its helper functions (`fb`, `mc`, `tf`, `lq`, `k`) to the top of your file and follow its style.
- The type is `LevelDayContent` in `../types.ts`.

## One day

| Field | Rules |
|---|---|
| `intro` | 2–3 Mongolian sentences: what today is about and why it is useful. |
| `objectives` | 3 short Mongolian goals. |
| `words` | **8** new words that fit the topic and level: `[word, kana, mongolian, english, pos, example, exampleMn]`. `kana` is the reading in kana only. The `example` uses the word, is natural, and ends with `。`/`？`/`！`. `pos` is one of: noun, pronoun, verb1, verb2, verb3, i-adj, na-adj, adverb, expression, question, number, counter, suffix, prenoun, conjunction. |
| `kanji` | **3** new kanji of the day's JLPT level, ideally used in the day's words. Write them as `k(char, mn meaning, en, on in katakana "ア, イ" or "—", kun in hiragana with okurigana in parentheses "あつ(まる)" or "—", correct stroke count, 3 examples [word, kana reading, mn], [japanese sentence, mongolian])`. |
| `grammar` | The day's outline points, as 1–2 grammar entries. `slug` must be `nX-…` in romaji and unique. `category` is one of: particles, verbs, adjectives, grammar, numbers, expressions. `structure` shows how the form is built. `explanation` is a 4–7 sentence Mongolian paragraph covering how to form it, what it means, its nuance and register, and how it differs from similar forms; compare it with Mongolian where that helps. Add 3–4 `examples` [ja, mn], 1–2 `mistakes` {wrong, right, note}, and **3 questions** mixing `fb` (blank written as `（　）`), `mc` and `tf`. |
| `dialogue` | 3–5 lines `{ speaker, ja, mn }` that use the grammar in a real situation. |
| `reading` | `passage` length: N4 150–300 characters, N3 250–450, N2 400–700. It uses the day's words and grammar and has the style of a JLPT reading text. Add 2–3 `mc` questions. |
| `listening` | `title` (mn); `type` is one of task, point, utterance, response, numbers; `context` (mn) describes the situation and what to listen for. The `script` has 4–8 lines with speakers (男, 女, 店員, 先生…). Write numbers that matter in kana, because speech synthesis reads the script. Add 2–4 `vocabulary` entries [word, kana, mn], a `grammarNote` (mn), and 2 `lq` questions. |
| `speaking` | `title` (mn), `prompt` (ja), `promptMn`, `hint` (mn) that names the forms to use, 2–3 `expected` model answers, and 2–4 `keywords` `{ ja: kana form, alts: [kanji spellings / variants], mn }`. Keywords are matched against speech-recognition text that has been converted to hiragana. |

**Answers must be exactly one of the options.** Options are 4 distinct strings. A `tf` answer is a boolean. Every question has an explanation; it can quote the text, as in 「…」.

Some outline days are skill or exam-practice days (reading strategy, listening task types, mock exam). They still get full content. Their grammar is 1–2 key review points of the level that fit the theme. Their reading and listening follow the JLPT task style the day names.

## Uniqueness

A kanji, or a word with the same `word|kana`, may be taught only once in the whole course. That includes N5 and every other level file. The validator lists what is already taken; pick another item instead of repeating one.

## Check your work (from `server/`)

```bash
npx tsc -p prisma/tsconfig.json --noEmit
npx tsx prisma/validate-levels.ts nX-uYY      # your file only
```

Repeat until there are **0 errors**. Then re-read the Japanese once for naturalness and correct readings, and the Mongolian for clarity.
