# Architecture

## Principles

- **Content is data.** Lessons, words, grammar, texts, scripts, questions, exams and
  scenarios live in `content/*.json`, validated by zod schemas (`shared/contentSchema.ts`)
  and imported into SQLite. The UI renders whatever the content contains.
- **One learning engine, shared.** All rules — spaced repetition, scoring, CEFR estimation,
  streaks, the session planner, the writing checker — are pure functions in `shared/`,
  unit-tested and used by both the server and the browser.
- **The server is the source of truth for assessment.** Practice answers are checked in the
  browser for instant feedback; module tests, level exams and placement are generated,
  stored and graded on the server, and answers never reach the browser beforehand.
- **AI is optional and isolated.** `server/ai/provider.ts` is the only code that calls an
  external API. Every AI feature has an offline fallback that says honestly what it is.

## Runtime

```
Browser (React SPA, PWA)  ──/api──▶  Fastify (server/app.ts)
                                        │  auth hook (session cookie)
                                        ├─ routes/*  → services/* → SQLite (better-sqlite3)
                                        └─ ai/provider → Claude API (only if ANTHROPIC_API_KEY)
```

- `server/index.ts`: open DB → migrate → import content (changed files only, by SHA-1) →
  start server. In production it also serves `dist/` with an SPA fallback.
- Auth: scrypt password hashes; random session tokens stored as SHA-256 hashes; httpOnly
  SameSite=Lax cookie; login rate limiting. The first account is the admin.
- Streaming: tutor and conversation replies are server-sent events (`delta`, `done`, `error`).
- Testing hooks: with `NODE_ENV=test`, the `x-test-now` header sets the server clock so
  streaks and review scheduling can be tested across days.

## Data model (SQLite, `server/db/migrations/0001_init.sql`)

Content (re-imported safely): `levels`, `modules` (incl. `doc` = full JSON and `status`
draft/published/planned), `lessons` (core + generated review lesson), `activities` (lesson
steps), `vocabulary` (course words + personal words with `owner_user_id`),
`grammar_topics`, `pronunciation_topics`, `reading_materials`, `listening_materials`,
`speaking_tasks`, `writing_tasks`, `quiz_questions` (owner_type/owner_id),
`conversation_scenarios`, `placement_test`, `achievements`.

Learner: `users`, `auth_sessions`, `user_settings`, `skill_profile` (CEFR estimate,
rolling accuracy, adaptive difficulty per skill), `cefr_snapshots`, `placement_results`,
`user_levels`, `user_progress` (per lesson, resumable step), `user_vocab` (SRS state +
proficiency dimensions), `vocabulary_reviews` (log), `quiz_attempts` (stored papers),
`question_responses` (every answer), `user_errors` (mistakes notebook), `streaks`,
`study_days`, `study_sessions`, `activity_log`, `xp_events`, `user_achievements`,
`module_results`, `level_results`, `speaking_attempts`, `writing_submissions`,
`daily_challenges`, `ai_threads`, `ai_messages`, `weekly_focus`.

Stable ids (`b1-01-l1`, `b1-01-l1-routine`) mean re-importing content keeps learner
progress. Deleting content cascades only to that content's own progress rows.

## Key flows

- **Lesson**: `GET /api/lessons/:id` builds steps from `activities` + content tables and
  generates vocabulary exercises from word data (`shared/vocabExercises.ts`). Showing the
  vocabulary step introduces words into SRS (same-day review). Answers go to
  `/api/practice/answers` (analytics, accuracy, mistakes notebook); vocabulary answers to
  `/api/review/grade`. `POST /complete` records the score, adapts difficulty, adds CEFR
  evidence, awards XP/achievements, updates the streak and returns the next step.
- **Daily session**: `services/session.ts` gathers the learner's state →
  `shared/sessionPlanner.ts` → a stored plan. The session page embeds each activity; work
  done elsewhere (a lesson, a module test, reviews, the challenge) also ticks off the plan.
- **Tests**: `services/assessments.ts` draws questions (module test pool, grammar pools,
  generated vocabulary items, unseen texts) into a stored paper; the browser gets a
  stripped copy; submission is graded server-side and produces section scores, objectives
  achieved, mistakes, recommendations, CEFR evidence and unlocking.
- **Placement**: items tagged A2–C1 → per-skill estimates (`shared/placement.ts`) →
  profile + recommended start level → the learner confirms the starting level.

## Front end

React 19 + React Router + TanStack Query + Tailwind 4. Pages are lazy-loaded. Reusable
activities (`src/components/activities/*`) are shared by lessons, the session runner and
the practice pages. Charts are small hand-written SVGs (`src/components/charts.tsx`) with
hover/focus tooltips and a table view; skill colours come from a palette validated for
colour-vision deficiency in light and dark mode. Audio: `src/lib/tts.ts` (browser speech,
line by line, per-speaker voices), `src/lib/speech.ts` (MediaRecorder + Web Speech
recognition). PWA via `vite-plugin-pwa`; review answers made offline are queued in
`localStorage` and synced (`src/lib/offline.ts`).

Accessibility: semantic landmarks, skip link, labelled controls, visible focus, keyboard
shortcuts for choices and flashcards, reduced-motion and larger-text settings, text never
coloured only by data colour, touch targets ≥ 40px.
