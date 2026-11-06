// API response types, taken straight from the server so both sides stay in sync.
// These are type-only imports: no server code is bundled into the browser.

import type { dashboard } from '../../server/services/dashboard';
import type { lessonPayload } from '../../server/services/lessons';
import type { weeklyReport, monthlyReport, knowledgeMap, analytics } from '../../server/services/reports';
import type { publicPaper } from '../../server/services/assessments';
import type { submitPlacement } from '../../server/services/assessments';
import type { getThread } from '../../server/ai/tutor';
import type { listErrors, errorExercise } from '../../server/services/errors';
import type { wordView, vocabCounts } from '../../server/services/vocab';
import type { gameList } from '../../server/services/games';
import type { todayChallenge } from '../../server/services/challenge';
import type { practiceLibrary, dictationSet, shadowingSet } from '../../server/services/practice';
import type { skillProfile } from '../../server/services/skills';
import type { Settings } from '../../server/services/users';

export type { LevelView, ModuleView, LessonView, NextStep } from '../../server/services/course';
export type { StepView, QuestionDTO, CompletionResult, Step } from '../../server/services/lessons';
export type { TestResult, SectionResult, Mistake } from '../../server/services/assessments';
export type { SessionView } from '../../server/services/session';
export type { ReviewItem } from '../../server/services/vocab';
export type { WritingFeedback, SpeakingFeedback } from '../../server/ai/feedback';
export type { ActivityResult } from '../../server/services/activity';
export type { AchievementDef } from '@shared/gamification';
export type { VocabExercise } from '@shared/vocabExercises';
export type { Question } from '@shared/contentSchema';
export type { PlannedItem } from '@shared/sessionPlanner';

export type Dashboard = ReturnType<typeof dashboard>;
export type LessonPayload = ReturnType<typeof lessonPayload>;
export type WeeklyReport = ReturnType<typeof weeklyReport>;
export type MonthlyReport = ReturnType<typeof monthlyReport>;
export type KnowledgeMap = ReturnType<typeof knowledgeMap>;
export type Analytics = ReturnType<typeof analytics>;
export type Paper = ReturnType<typeof publicPaper>;
export type PlacementResult = Awaited<ReturnType<typeof submitPlacement>>;
export type Thread = ReturnType<typeof getThread>;
export type ErrorRow = ReturnType<typeof listErrors>[number];
export type ErrorExercise = ReturnType<typeof errorExercise>;
export type Word = ReturnType<typeof wordView>;
export type VocabCounts = ReturnType<typeof vocabCounts>;
export type GameInfo = ReturnType<typeof gameList>[number];
export type Challenge = ReturnType<typeof todayChallenge>;
export type PracticeLibrary = ReturnType<typeof practiceLibrary>;
export type DictationSet = ReturnType<typeof dictationSet>;
export type ShadowingSet = ReturnType<typeof shadowingSet>;
export type SkillProfile = ReturnType<typeof skillProfile>;
export type SettingsData = Settings & { effectiveExplanationLanguage: 'en' | 'mn' | 'mixed' };

export interface AuthStatus {
  needsSetup: boolean;
  allowRegistration: boolean;
  user: { id: number; username: string; displayName: string; role: 'learner' | 'admin' } | null;
  ai: { available: boolean; model: string | null };
}
