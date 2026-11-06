-- Fluent Path schema v1.
-- Content tables are (re)filled by the content importer from content/*.json.
-- User tables hold progress and must never be wiped by content imports.

-- ============================================================ content

CREATE TABLE levels (
  code        TEXT PRIMARY KEY,
  ord         INTEGER NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  description_mn TEXT,
  can_do      TEXT NOT NULL DEFAULT '[]',
  exam_json   TEXT
);

CREATE TABLE modules (
  id              TEXT PRIMARY KEY,
  level_code      TEXT NOT NULL REFERENCES levels(code),
  ord             INTEGER NOT NULL,
  title           TEXT NOT NULL,
  topic           TEXT NOT NULL,
  description     TEXT NOT NULL,
  description_mn  TEXT,
  objectives      TEXT NOT NULL DEFAULT '[]',
  targets         TEXT NOT NULL DEFAULT '{}',
  test_json       TEXT,
  -- Full validated module document (what the admin editor loads and saves).
  doc             TEXT,
  prerequisite_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'planned')),
  source_file     TEXT,
  content_hash    TEXT,
  updated_at      TEXT NOT NULL
);
CREATE INDEX modules_level ON modules(level_code, ord);

CREATE TABLE grammar_topics (
  id            TEXT PRIMARY KEY,
  module_id     TEXT REFERENCES modules(id) ON DELETE CASCADE,
  cefr_level    TEXT NOT NULL,
  title         TEXT NOT NULL,
  data          TEXT NOT NULL,
  prerequisites TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL
);

CREATE TABLE pronunciation_topics (
  id         TEXT PRIMARY KEY,
  module_id  TEXT REFERENCES modules(id) ON DELETE CASCADE,
  cefr_level TEXT NOT NULL,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE lessons (
  id               TEXT PRIMARY KEY,
  module_id        TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  ord              INTEGER NOT NULL,
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'core' CHECK (kind IN ('core', 'review')),
  focus            TEXT NOT NULL,
  skills           TEXT NOT NULL DEFAULT '[]',
  cefr_level       TEXT NOT NULL,
  difficulty       INTEGER NOT NULL DEFAULT 3,
  minutes          INTEGER NOT NULL DEFAULT 20,
  prerequisite_id  TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  objectives       TEXT NOT NULL DEFAULT '[]',
  warmup           TEXT,
  phrases          TEXT NOT NULL DEFAULT '[]',
  quiz             TEXT NOT NULL DEFAULT '[]',
  grammar_topic_id TEXT REFERENCES grammar_topics(id) ON DELETE SET NULL,
  pronunciation_id TEXT REFERENCES pronunciation_topics(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  updated_at       TEXT NOT NULL
);
CREATE INDEX lessons_module ON lessons(module_id, ord);

-- Ordered building blocks of a lesson (derived from lesson content on import).
CREATE TABLE activities (
  id         TEXT PRIMARY KEY,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  ord        INTEGER NOT NULL,
  type       TEXT NOT NULL,
  skill      TEXT NOT NULL,
  ref_id     TEXT,
  minutes    INTEGER NOT NULL DEFAULT 3,
  difficulty INTEGER NOT NULL DEFAULT 3
);
CREATE INDEX activities_lesson ON activities(lesson_id, ord);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'admin')),
  created_at    TEXT NOT NULL
);

CREATE TABLE vocabulary (
  id            TEXT PRIMARY KEY,
  word          TEXT NOT NULL,
  pos           TEXT,
  ipa           TEXT,
  definition    TEXT NOT NULL,
  mongolian     TEXT,
  examples      TEXT NOT NULL DEFAULT '[]',
  collocations  TEXT NOT NULL DEFAULT '[]',
  synonyms      TEXT NOT NULL DEFAULT '[]',
  antonyms      TEXT NOT NULL DEFAULT '[]',
  mistake       TEXT,
  note          TEXT,
  cefr_level    TEXT NOT NULL,
  difficulty    INTEGER NOT NULL DEFAULT 3,
  topic         TEXT,
  module_id     TEXT REFERENCES modules(id) ON DELETE CASCADE,
  lesson_id     TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL DEFAULT 0,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  personal_note TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- Course words belong to a lesson; personal words belong to a user.
  CHECK (owner_user_id IS NOT NULL OR lesson_id IS NOT NULL)
);
CREATE INDEX vocabulary_lesson ON vocabulary(lesson_id, ord);
CREATE INDEX vocabulary_module ON vocabulary(module_id);
CREATE INDEX vocabulary_owner ON vocabulary(owner_user_id);
CREATE INDEX vocabulary_word ON vocabulary(word COLLATE NOCASE);

-- context: lesson | module_test | level_exam | placement
CREATE TABLE reading_materials (
  id         TEXT PRIMARY KEY,
  context    TEXT NOT NULL,
  lesson_id  TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  module_id  TEXT REFERENCES modules(id) ON DELETE CASCADE,
  cefr_level TEXT NOT NULL,
  title      TEXT NOT NULL,
  genre      TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE listening_materials (
  id         TEXT PRIMARY KEY,
  context    TEXT NOT NULL,
  lesson_id  TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  module_id  TEXT REFERENCES modules(id) ON DELETE CASCADE,
  cefr_level TEXT NOT NULL,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE speaking_tasks (
  id         TEXT PRIMARY KEY,
  context    TEXT NOT NULL,
  lesson_id  TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  module_id  TEXT REFERENCES modules(id) ON DELETE CASCADE,
  cefr_level TEXT NOT NULL,
  type       TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE writing_tasks (
  id         TEXT PRIMARY KEY,
  context    TEXT NOT NULL,
  lesson_id  TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  module_id  TEXT REFERENCES modules(id) ON DELETE CASCADE,
  cefr_level TEXT NOT NULL,
  type       TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  register   TEXT NOT NULL,
  min_words  INTEGER NOT NULL,
  max_words  INTEGER NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- owner_type: lesson_warmup | lesson_quiz | grammar_guided | grammar_free | reading | listening_gist
--             | listening_detail | module_test | level_exam | placement_grammar | placement_vocabulary
CREATE TABLE quiz_questions (
  id         TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  module_id  TEXT REFERENCES modules(id) ON DELETE CASCADE,
  ord        INTEGER NOT NULL DEFAULT 0,
  skill      TEXT NOT NULL,
  type       TEXT NOT NULL,
  cefr_level TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 3,
  tag        TEXT,
  data       TEXT NOT NULL
);
CREATE INDEX quiz_questions_owner ON quiz_questions(owner_type, owner_id, ord);
CREATE INDEX quiz_questions_module ON quiz_questions(module_id);

CREATE TABLE conversation_scenarios (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  min_level TEXT NOT NULL,
  category  TEXT NOT NULL,
  data      TEXT NOT NULL
);

CREATE TABLE placement_test (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

CREATE TABLE achievements (
  code        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  category    TEXT NOT NULL,
  xp          INTEGER NOT NULL,
  ord         INTEGER NOT NULL
);

-- ============================================================ users & progress

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE user_settings (
  user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schedule             TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('daily', 'alternate')),
  intensity            TEXT NOT NULL DEFAULT 'standard' CHECK (intensity IN ('casual', 'standard', 'intensive')),
  daily_minutes        INTEGER NOT NULL DEFAULT 30,
  explanation_language TEXT NOT NULL DEFAULT 'auto' CHECK (explanation_language IN ('auto', 'en', 'mn', 'mixed')),
  theme                TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  reduce_motion        INTEGER NOT NULL DEFAULT 0,
  large_text           INTEGER NOT NULL DEFAULT 0,
  tts_voice            TEXT,
  tts_rate             REAL NOT NULL DEFAULT 1.0,
  placement_status     TEXT NOT NULL DEFAULT 'pending' CHECK (placement_status IN ('pending', 'done', 'skipped')),
  course_level         TEXT NOT NULL DEFAULT 'B1' REFERENCES levels(code),
  onboarded            INTEGER NOT NULL DEFAULT 0,
  updated_at           TEXT NOT NULL
);

-- Current CEFR estimate per skill (numeric scale, see shared/cefr.ts).
CREATE TABLE skill_profile (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill      TEXT NOT NULL,
  score      REAL NOT NULL,
  accuracy   REAL,
  responses  INTEGER NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 4,
  provisional INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, skill)
);

CREATE TABLE cefr_snapshots (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  overall REAL NOT NULL,
  skills  TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE placement_results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_at   TEXT NOT NULL,
  overall    REAL NOT NULL,
  skills     TEXT NOT NULL,
  summary    TEXT NOT NULL,
  details    TEXT NOT NULL
);

-- Levels a learner may study (placement or level exams unlock more).
CREATE TABLE user_levels (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_code  TEXT NOT NULL REFERENCES levels(code),
  status      TEXT NOT NULL CHECK (status IN ('unlocked', 'placed_out', 'completed')),
  unlocked_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (user_id, level_code)
);

CREATE TABLE user_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  current_step INTEGER NOT NULL DEFAULT 0,
  step_data    TEXT NOT NULL DEFAULT '{}',
  score        REAL,
  best_score   REAL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

-- Per-user spaced-repetition state for each word.
CREATE TABLE user_vocab (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocab_id         TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  state            TEXT NOT NULL CHECK (state IN ('NEW', 'LEARNING', 'FAMILIAR', 'MASTERED', 'REVIEW')),
  step             INTEGER NOT NULL DEFAULT 0,
  ease             REAL NOT NULL DEFAULT 2.5,
  interval_days    REAL NOT NULL DEFAULT 0,
  due_at           TEXT,
  lapses           INTEGER NOT NULL DEFAULT 0,
  reviews          INTEGER NOT NULL DEFAULT 0,
  correct_count    INTEGER NOT NULL DEFAULT 0,
  incorrect_count  INTEGER NOT NULL DEFAULT 0,
  exposure_count   INTEGER NOT NULL DEFAULT 0,
  confidence       REAL NOT NULL DEFAULT 0,
  recognition      REAL NOT NULL DEFAULT 0,
  recall           REAL NOT NULL DEFAULT 0,
  context          REAL NOT NULL DEFAULT 0,
  production       REAL NOT NULL DEFAULT 0,
  retention        REAL NOT NULL DEFAULT 0,
  retention_checks INTEGER NOT NULL DEFAULT 0,
  first_seen_at    TEXT NOT NULL,
  first_learned_at TEXT,
  last_reviewed_at TEXT,
  suspended        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, vocab_id)
);
CREATE INDEX user_vocab_due ON user_vocab(user_id, due_at);
CREATE INDEX user_vocab_state ON user_vocab(user_id, state);

CREATE TABLE vocabulary_reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocab_id        TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL,
  dimension       TEXT NOT NULL,
  grade           TEXT NOT NULL,
  correct         INTEGER NOT NULL,
  response_ms     INTEGER,
  interval_before REAL NOT NULL,
  interval_after  REAL NOT NULL,
  state_after     TEXT NOT NULL,
  source          TEXT NOT NULL,
  reviewed_at     TEXT NOT NULL
);
CREATE INDEX vocabulary_reviews_user ON vocabulary_reviews(user_id, reviewed_at);

-- context_type: lesson | module_test | level_exam | placement | review | game | session | challenge
CREATE TABLE quiz_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_type   TEXT NOT NULL,
  context_id     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  paper          TEXT,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  score          REAL,
  max_score      REAL,
  percent        REAL,
  section_scores TEXT,
  details        TEXT
);
CREATE INDEX quiz_attempts_user ON quiz_attempts(user_id, context_type, context_id);

-- Every answered question, for skill accuracy and analytics.
CREATE TABLE question_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id   INTEGER REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  question_id  TEXT,
  context_type TEXT NOT NULL,
  context_id   TEXT,
  skill        TEXT NOT NULL,
  qtype        TEXT NOT NULL,
  tag          TEXT,
  cefr_level   TEXT,
  difficulty   INTEGER,
  correct      INTEGER NOT NULL,
  score        REAL NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX question_responses_user ON question_responses(user_id, skill, created_at);

CREATE TABLE user_errors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,
  pattern_key     TEXT NOT NULL,
  wrong           TEXT NOT NULL,
  correct         TEXT NOT NULL,
  explanation     TEXT,
  explanation_mn  TEXT,
  source          TEXT NOT NULL,
  source_ref      TEXT,
  occurrences     INTEGER NOT NULL DEFAULT 1,
  review_step     INTEGER NOT NULL DEFAULT 0,
  correct_reviews INTEGER NOT NULL DEFAULT 0,
  next_review_at  TEXT NOT NULL,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  resolved_at     TEXT,
  UNIQUE (user_id, pattern_key)
);
CREATE INDEX user_errors_due ON user_errors(user_id, resolved_at, next_review_at);

CREATE TABLE streaks (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current         INTEGER NOT NULL DEFAULT 0,
  longest         INTEGER NOT NULL DEFAULT 0,
  last_study_date TEXT,
  freezes         INTEGER NOT NULL DEFAULT 0,
  freezes_used    INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);

CREATE TABLE study_days (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  minutes     REAL NOT NULL DEFAULT 0,
  xp          INTEGER NOT NULL DEFAULT 0,
  activities  INTEGER NOT NULL DEFAULT 0,
  freeze_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE study_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  mode            TEXT NOT NULL,
  message         TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  plan            TEXT NOT NULL,
  completed       TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at      TEXT NOT NULL,
  finished_at     TEXT
);
CREATE INDEX study_sessions_user ON study_sessions(user_id, date);

-- Generic activity log: study time, activity types (variety), analytics.
CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  ref        TEXT,
  skill      TEXT,
  minutes    REAL NOT NULL DEFAULT 0,
  score      REAL,
  created_at TEXT NOT NULL,
  date       TEXT NOT NULL
);
CREATE INDEX activity_log_user ON activity_log(user_id, date);

CREATE TABLE xp_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref        TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX xp_events_user ON xp_events(user_id, created_at);

CREATE TABLE user_achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL REFERENCES achievements(code) ON DELETE CASCADE,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, code)
);

CREATE TABLE module_results (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id      TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  attempt_id     INTEGER REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  percent        REAL NOT NULL,
  section_scores TEXT NOT NULL,
  objectives     TEXT NOT NULL,
  passed         INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX module_results_user ON module_results(user_id, module_id);

CREATE TABLE level_results (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_code     TEXT NOT NULL REFERENCES levels(code),
  attempt_id     INTEGER REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  percent        REAL NOT NULL,
  skill_scores   TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  passed         INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE speaking_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      TEXT,
  context      TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  transcript   TEXT,
  audio_path   TEXT,
  duration_sec REAL,
  feedback     TEXT,
  ai_used      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX speaking_attempts_user ON speaking_attempts(user_id, created_at);

CREATE TABLE writing_submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id    TEXT,
  context    TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  text       TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  feedback   TEXT,
  score      REAL,
  ai_used    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX writing_submissions_user ON writing_submissions(user_id, created_at);

CREATE TABLE daily_challenges (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  response     TEXT,
  result       TEXT,
  completed_at TEXT,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE ai_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK (mode IN ('tutor', 'conversation')),
  scenario_id TEXT,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finished')),
  guided      INTEGER NOT NULL DEFAULT 0,
  feedback    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE ai_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_messages_thread ON ai_messages(thread_id, id);

-- Adaptive plan per week (Monday date).
CREATE TABLE weekly_focus (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  focus      TEXT NOT NULL,
  used       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week_start)
);
