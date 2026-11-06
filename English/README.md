# Fluent Path — English from B1 to C1

A personal, long-term English course for one learner (built for a Mongolian speaker
starting around B1). Every day the dashboard answers **"What should I learn today?"**
with one button — *Start today's session* — and after months the Progress pages answer
**"What has improved, what is still weak, and what should I study next?"**

- Structured curriculum **B1 → B1+ → B2 → B2+ → C1** (53 planned modules, data-driven)
- Lessons with warm-up → objectives → vocabulary → practice → grammar / reading /
  listening / pronunciation / speaking / writing → quiz → summary
- Spaced repetition for vocabulary, a "My mistakes" notebook, mini-games, daily challenges
- Placement test, module tests, level exams, CEFR estimate per skill
- Adaptive daily sessions (every day **or** every other day), gentle streaks, recovery sessions
- Weekly and monthly reports, knowledge map, achievements, XP ranks
- Optional AI tutor, conversation role-play and AI writing/speaking feedback (Claude API)
- Works on phone, tablet and desktop; installable as an app (PWA); light and dark mode

---

## 1. How to run it

Requirements: **Node.js 20.12+** (tested with Node 22) and a modern browser.
Chrome or Edge are recommended because they support speech recognition. Listening
activities use **natural voices** made on this computer by Kokoro, an open neural voice
model (about 330 MB, downloaded once into `data/models` on first start). Audio for each line
is generated once, cached in `data/speech`, and the whole course is prepared in the
background after the server starts. Until a line is ready, or if natural voices are turned
off (Settings, or `NATURAL_VOICES=false`), the browser's own speech engine is used.

```bash
npm install          # once
npm run build        # builds the web app into dist/
npm start            # starts the server → open http://localhost:3001
```

On first start the database is created and all course content is imported
automatically.

**Development** (hot reload for server and UI):

```bash
npm run dev          # API on :3001, web app on http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit and integration tests (Vitest, in-memory database) |
| `npm run e2e` | Browser test with your installed Edge/Chrome: setup, onboarding, a full lesson, every page at phone and desktop size, screenshots in `screenshots/` (run `npm run build` first) |
| `npm run typecheck` | TypeScript check of server and web app |
| `npm run content:validate` | Checks all content files against the schema plus quality rules |
| `npm run content:import -- --force` | Re-imports all content into the database |
| `npm run db:migrate` | Applies database migrations (also done automatically on start) |
| `npm run user:reset-password -- <username> <new-password>` | Resets a forgotten password |

The empty `main.py` in this folder is not used by the app.

## 2. Environment variables

Copy `.env.example` to `.env`. Everything is optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Server port |
| `DATABASE_PATH` | `./data/fluent-path.db` | SQLite database file |
| `RECORDINGS_DIR` | `./data/recordings` | Where speaking recordings are saved |
| `ALLOW_REGISTRATION` | `false` | Allow creating more accounts after the first |
| `CONTENT_WRITE_BACK` | `true` | Admin edits are also written to `content/modules/*.json` |
| `ANTHROPIC_API_KEY` | – | Enables the AI features (see 4) |
| `AI_MODEL` | `claude-opus-5` | Model for tutor and feedback (`claude-sonnet-5` is cheaper) |
| `NATURAL_VOICES` | `true` | Neural voices for listening, dictation and pronunciation (see 1) |
| `SPEECH_CACHE_DIR` | `./data/speech` | Generated voice audio (safe to delete; it is made again) |
| `MODELS_DIR` | `./data/models` | Downloaded voice model |

## 3. Database setup

Nothing to install: the app uses **SQLite** through `better-sqlite3`. The file in
`data/` is created on first start; SQL migrations in `server/db/migrations/` are applied
automatically and recorded in `schema_migrations`. To back up your progress, copy the
`data/` folder. To start over, stop the server and delete `data/fluent-path.db*`.

## 4. AI setup (optional)

The whole course works without AI. With a key you also get:

- **AI tutor** — explains words, grammar and corrections; knows your level, weak words,
  repeated mistakes and completed modules; can answer in Mongolian.
- **Conversation mode** — role-play (job interview, hotel, doctor, debate…) at your level,
  with feedback at the end.
- **AI writing and speaking feedback** — corrections (original → improved + why), a better
  version, useful vocabulary and criteria scores. No fake precision: pronunciation is never
  "scored" from a transcript.

Add `ANTHROPIC_API_KEY=sk-ant-…` to `.env` and restart. Without it: the tutor runs in
offline mode (course dictionary, rule-based checker, grammar topics), conversations use
scripted guided turns with sample answers, and writing/speaking get automatic feedback that
is clearly labelled as such.

## 5. Login / demo account

There is **no built-in default password**. On first launch the app asks you to create an
account; that first account is also the content **admin**. Then onboarding asks for your
schedule (every day / every other day), intensity (15–20 / 25–35 / 45–60 min) and
explanation language, and offers the placement test (or start at B1).

## 6. Architecture

```
shared/    Pure TypeScript used by server AND browser: CEFR scale, spaced repetition,
           answer scoring, writing checker, dictation diff, streaks, XP/achievements,
           adaptive rules, session planner, placement scoring, content schema (zod)
server/    Fastify API + SQLite
  db/          connection, migrations
  content/     importer (JSON → tables, idempotent) and content linter
  services/    users, course & unlocking, lessons, vocab (SRS), errors, skills (CEFR),
               assessments (tests/exams/placement), session, practice, games,
               challenge, reports, dashboard, admin, focus (weekly adaptive plan)
  ai/          provider (the only file that calls the Claude API), feedback, tutor
  routes/      HTTP endpoints (auth, learner, vocab, assessments, practice, reports, ai, admin)
src/       React 19 + Vite + Tailwind web app (pages, activities, games, charts)
content/   Course content as JSON (levels + outline, modules, exams, placement, scenarios)
tests/     Vitest unit tests (shared/) and API integration tests (server/)
scripts/   e2e browser test, icon generation
```

More detail — data model, request flow, design decisions — in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 7. How to add new lessons

Content is data, never code. Two ways:

1. **Admin panel** (`Content admin` in the menu): create a module, add lessons and
   vocabulary with forms, and edit grammar topics, readings, listenings, questions and the
   module test in the JSON tab. *Validate* shows schema errors and quality warnings;
   *Save* imports it and writes it back to `content/modules/…json`. Publish when ready —
   drafts are invisible to the learner.
2. **JSON files**: add `content/modules/<LEVEL>/<id>-<name>.json` following
   `content/modules/B1/b1-01-everyday-life.json`, run `npm run content:validate`, then
   restart (or `npm run content:import`).

Rules and level guidelines are in [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md).
Modules listed in `content/levels.json` but not written yet appear on the roadmap as
"In preparation" and never block progress. Re-importing never deletes learner progress:
lessons and words keep stable ids.

## 8. How adaptive learning works

- **Skill statistics**: every answer is stored with its skill, type, level and difficulty.
  Each skill keeps a rolling accuracy and a CEFR estimate.
- **Difficulty rule** after each lesson/test section: ≥ 90% → one step harder; 70–89% →
  same; 50–69% → same plus extra practice; < 50% → one step easier and review of
  prerequisites. Never a sudden jump. Difficulty changes listening speed and the mix of
  recognition vs production exercises.
- **Weak skills** (accuracy < 65% or half a band behind your average) get extra activities
  in a **weekly focus plan** (e.g. *"You are understanding written English better than
  spoken English. This week, 2 additional listening activities have been added."*). Strong
  skills get lighter practice.
- **Daily session planner** (`shared/sessionPlanner.ts`) chooses items from: reviews due,
  mistakes due, the next part of the current lesson (or the module test), the weekly focus,
  weak skills, variety (it avoids repeating recent activity types and games), the daily
  challenge — fitted to your minutes per day. After a break (3+ days, or 4+ on the
  every-other-day plan) it builds a short **recovery session** instead of a backlog.

## 9. How spaced repetition works

A hybrid of a fixed review ladder and SM-2 ease factors (`shared/srs.ts`):

- New word → **same day** → **2 days** → **7** → **14** → **30**, then the interval grows by
  the word's ease factor.
- *Again* sends the word back to the start and lowers its ease; words forgotten 3+ times
  ("leeches") get shorter intervals. *Easy* skips a rung and raises ease.
- Exercise formats target each word's weakest dimension: **recognition** (meaning,
  translation, synonym), **recall** (flashcards), **context** (cloze, collocations) and
  **production** (typing, word builder, using it in writing/speaking).
- A word is **Mastered** only after spaced success in every dimension, a 21+ day interval and
  a successful retention check — not after one correct answer. States: New → Learning →
  Familiar → Mastered, or Review when a known word was forgotten.
- Every-other-day learners also get tomorrow's due words today, so nothing waits two
  extra days. Reviews work offline and sync later.

## 10. How CEFR progression works

- Scale: A2 = 1 … B1 = 2, B1+ = 2.5, B2 = 3, B2+ = 3.5, C1 = 4. Each skill (grammar,
  vocabulary, reading, listening, speaking, writing; plus pronunciation, fluency and
  comprehension derived from them) has its own estimate.
- The **placement test** sets the first estimates from per-level accuracy (items are tagged
  A2–C1) and recommends a starting level; earlier levels become optional.
- Estimates move with evidence: lesson quizzes a little, module tests more, level exams
  most. Doing well on easy material never lowers a higher estimate.
- Modules unlock in order; a module is completed by passing its test (60%). Questions are
  drawn randomly, so the test can't be memorised.
- A **level is unlocked only by evidence**: the level exam needs 70% overall and at least
  55% in every skill. The result says "Recommended to continue to B2", never "You are B2".
- Completing C1 unlocks a **personal learning achievement** page — clearly not an official
  CEFR certificate.

## 11. Known limitations

- **Content in progress**: the full 53-module syllabus is designed and in the database, but
  not every module has lessons yet. Written modules are playable; the rest show "In
  preparation". Level exams exist only where `content/exams/<level>.json` is present.
- **Audio uses the browser's speech engine**, not recorded audio. Quality depends on the
  voices installed (Edge on Windows has good natural voices). No voices → transcripts are
  shown instead.
- **Speech recognition** (live transcripts) works in Chrome and Edge and needs internet;
  elsewhere you can record, listen back and self-assess. Pronunciation is never scored.
- **Without an AI key**, writing and speaking feedback is rule-based: it catches frequent
  learner errors and measures length, linking and vocabulary, but not every mistake.
  Writing/speaking marks in tests are then labelled as estimates.
- CEFR estimates are the app's evidence-based estimates, not certified levels.
- Designed for one learner per installation (multiple accounts work, but there is no
  teacher/class view).

## 12. Recommended future improvements

1. Finish the remaining module content and level exams (the schema, validator and admin
   editor are ready).
2. Recorded native-speaker audio or a cloud text-to-speech provider behind the existing
   `src/lib/tts.ts` interface.
3. A pronunciation assessment service (phoneme-level) for real pronunciation feedback.
4. FSRS-style parameter fitting from the learner's own review history.
5. Server sync for full offline mode (lessons, not only reviews).
6. AI-generated extra practice items reviewed through the admin panel.
7. Export/import of progress, and optional reminders (web push) for study days.
