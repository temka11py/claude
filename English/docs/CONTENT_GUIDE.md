# Content authoring guide

All course content lives in `content/` as JSON and is imported into the database
on server start (and with `npm run content:import`). The database schema never
needs to change to add content.

| File | What it contains | Schema (`shared/contentSchema.ts`) |
|---|---|---|
| `content/levels.json` | The 5 CEFR levels and the outline of every planned module | `levelsDoc` |
| `content/modules/<LEVEL>/<module-id>-<slug>.json` | One complete module | `moduleDoc` |
| `content/exams/<level>.json` | Level exam materials | `levelExamDoc` |
| `content/placement.json` | Placement test | `placementDoc` |
| `content/scenarios.json` | Conversation practice scenarios | `scenarioDoc` |

Level folders: `B1`, `B1plus`, `B2`, `B2plus`, `C1`.

**Reference module:** `content/modules/B1/b1-01-everyday-life.json`. Copy its
structure. Validate with:

```bash
npx tsx server/cli/validate.ts content/modules/B1/b1-02-people.json
```

A module needs **0 errors**. Fix warnings unless there is a good reason.

## Module structure

- `id`, `level`, `order`, `title`, `topic` must match the outline in `levels.json`.
- `objectives`: 4–6 objects `{ "text", "skills": [...] }`. The module test uses
  the skills to report which objectives were achieved.
- `targets`: grammar/vocabulary lists plus one sentence for each skill.
- `grammar`: 1–2 grammar topics (ids unique within the module).
- `pronunciation`: 1 topic.
- `lessons`: 4 lessons with ids `<module-id>-l1` … `-l4`. The pattern that works:
  1. **Vocabulary + reading** (focus `vocabulary`) — 10–12 words, reading text.
  2. **Grammar** (focus `grammar`) — 8–10 words, grammar topic, speaking task.
  3. **Listening + speaking** (focus `listening`) — 8–10 words, listening, pronunciation topic, speaking task.
  4. **Writing** (focus `writing`) — 8–10 words/phrases, real-life phrases, second grammar topic, writing task.

  Vary this when a topic calls for it (e.g. a debate lesson at C1), but every
  module must practise all six skills.
- A **module review lesson** is generated automatically. Do not write one.
- `test`: an **unseen** reading, listening, writing task, speaking task and
  10–12 grammar/vocabulary questions. Never reuse lesson texts or questions.

Every lesson follows the same learner-facing structure: warm-up → objectives →
vocabulary → practice → skills sections → quiz → summary.

## Vocabulary entries

Teach **word + pronunciation + meaning + example + collocation + common mistake + context**.

- `definition`: simple English, no harder than the word itself.
- `mn`: accurate, natural Mongolian (Cyrillic). Give the meaning used in the examples.
- `examples`: **2 natural sentences that contain the word** (any inflection).
  The app blanks the word out of these for cloze exercises.
- `collocations`: 2–4 real, high-frequency collocations that contain the word.
- `synonyms` / `antonyms`: only if genuinely useful; empty arrays are fine.
- `mistake`: a real, common learner error (especially for Mongolian speakers).
- `note`: register or usage (e.g. British vs American, formal vs informal).
- `level`: the word's CEFR level. Stretch slightly above the module level.
- Don't repeat a word already taught in an earlier lesson of the same module.

## Questions

Types: `mcq`, `gap`, `tfng`, `short`, `order`, `words`, `match`, `correct`,
`transform`, `error`, `summary` (see the schema for fields).

- Set `skill` on lesson quiz and test questions (`grammar`, `vocabulary`, …).
- Use `tag` for reading/listening questions: `main_idea`, `detail`, `inference`,
  `vocab_context`, `purpose`, `tone`, `reference`, `summary`, `attitude`.
- Typed answers (`gap` without options, `correct`, `transform`, `short`) are
  compared after normalising case, punctuation and contractions. **List every
  acceptable answer.** Keep them short and unambiguous.
- `gap` with `options` must include one accepted answer among the options.
- True/False/Not given statements must be clearly decidable from the text.
- Recognition first (mcq, match), production later (gap typed, correct, transform).
- No trick questions, no ambiguous distractors, no duplicate questions.

## Reading and listening by level

| Level | Reading | Listening | Mongolian support |
|---|---|---|---|
| B1 | 200–350 words, articles, blogs, emails | slow, clear conversations, 8–14 lines | `mn` on everything (`summaryMn`, `whyMn`, `promptMn`, `useMn`) |
| B1+ | 250–450 words, longer articles | natural conversations, 10–16 lines | most explanations |
| B2 | 350–600 words, news and opinion | natural-speed conversations, interviews | vocabulary + grammar summaries |
| B2+ | 450–700 words, complex articles | interviews, podcasts, discussions, 14–20 lines | vocabulary, occasionally summaries |
| C1 | 550–900 words, academic, editorial, professional | lectures, debates, native-speed, 16–24 lines | vocabulary `mn` only |

Reading question mix: at least 3 types from mcq, tfng, short, order (paragraph
ordering), match (headings ↔ paragraphs), summary completion.

Listening scripts are read aloud by the browser's speech engine, so write them
as speech: contractions, fillers where natural (`Well,`, `I mean,`), no stage
directions, no sound effects.

## Writing and speaking by level

- Writing — B1: messages, short paragraphs, emails, descriptions. B1+: longer
  paragraphs, informal and formal emails. B2: opinion essays, reports, formal
  letters, summaries. B2+: argumentative essays, reports, analytical writing.
  C1: academic writing, professional reports, persuasive essays, synthesis.
- Speaking types: `describe`, `opinion`, `story`, `roleplay`, `discussion`,
  `presentation`, `debate`, `compare`. Use a variety across a level.
- Always include a model `sample` answer at the target level.

## Real-life English (`phrases`)

Discourse markers, idioms, phrasal verbs and conversation patterns. Always say
**when** a phrase is natural (`whenToUse`) and its `register`. Distinguish
formal writing from natural speech (e.g. `gonna` is informal speech only).
