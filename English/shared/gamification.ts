// XP, ranks and achievement definitions.

export const XP = {
  correctAnswer: 2,
  reviewCard: 1,
  lessonComplete: 50,
  lessonPerfectBonus: 20,
  moduleTestPass: 150,
  levelExamPass: 400,
  speakingTask: 20,
  writingTask: 25,
  dictationSentence: 3,
  gamePerCorrect: 2,
  dailyChallenge: 30,
  sessionComplete: 25,
  streakDay: 10,
  mistakeFixed: 5,
  placementTest: 50,
  conversation: 20,
} as const;

export interface Rank {
  level: number;
  title: string;
  minXp: number;
}

export const RANKS: Rank[] = [
  { level: 1, title: 'Explorer', minXp: 0 },
  { level: 2, title: 'Word Hunter', minXp: 300 },
  { level: 3, title: 'Sentence Builder', minXp: 800 },
  { level: 4, title: 'Grammar Crafter', minXp: 1600 },
  { level: 5, title: 'Storyteller', minXp: 2800 },
  { level: 6, title: 'Confident Speaker', minXp: 4500 },
  { level: 7, title: 'Idea Shaper', minXp: 6800 },
  { level: 8, title: 'Fluent Explorer', minXp: 9800 },
  { level: 9, title: 'Debate Ready', minXp: 13500 },
  { level: 10, title: 'Nuance Seeker', minXp: 18000 },
  { level: 11, title: 'Eloquent Thinker', minXp: 24000 },
  { level: 12, title: 'Language Master', minXp: 32000 },
];

export function rankFor(xp: number): { rank: Rank; next: Rank | null; progress: number } {
  let rank = RANKS[0];
  for (const r of RANKS) if (xp >= r.minXp) rank = r;
  const next = RANKS.find((r) => r.minXp > xp) ?? null;
  const progress = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, progress: Math.min(1, Math.max(0, progress)) };
}

export interface AchievementDef {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: 'learning' | 'vocabulary' | 'streak' | 'skills' | 'milestone';
  xp: number;
}

/** Metrics the achievement engine evaluates. */
export interface AchievementMetrics {
  lessonsCompleted: number;
  wordsLearned: number;
  wordsMastered: number;
  reviewsDone: number;
  longestStreak: number;
  speakingAttempts: number;
  writingSubmissions: number;
  essays: number;
  modulesCompleted: number;
  levelsPassed: string[];
  unlockedLevels: string[];
  perfectLessons: number;
  gamesPlayed: number;
  bossWins: number;
  mistakesFixed: number;
  customWords: number;
  conversations: number;
  dictationsPerfect: number;
  placementDone: boolean;
  sessionsCompleted: number;
  challengesCompleted: number;
}

export const ACHIEVEMENTS: (AchievementDef & { earned: (m: AchievementMetrics) => boolean })[] = [
  { code: 'placement', title: 'Know Your Starting Point', description: 'Complete the placement test.', icon: 'compass', category: 'milestone', xp: 20, earned: (m) => m.placementDone },
  { code: 'first_lesson', title: 'First Lesson', description: 'Complete your first lesson.', icon: 'book-open', category: 'learning', xp: 20, earned: (m) => m.lessonsCompleted >= 1 },
  { code: 'lessons_10', title: 'Getting Into Rhythm', description: 'Complete 10 lessons.', icon: 'library', category: 'learning', xp: 50, earned: (m) => m.lessonsCompleted >= 10 },
  { code: 'lessons_50', title: 'Dedicated Learner', description: 'Complete 50 lessons.', icon: 'graduation-cap', category: 'learning', xp: 150, earned: (m) => m.lessonsCompleted >= 50 },
  { code: 'perfect_lesson', title: 'Flawless', description: 'Finish a lesson quiz with 100%.', icon: 'sparkles', category: 'learning', xp: 30, earned: (m) => m.perfectLessons >= 1 },
  { code: 'first_session', title: 'Daily Habit Begins', description: 'Finish a full daily session.', icon: 'calendar-check', category: 'learning', xp: 20, earned: (m) => m.sessionsCompleted >= 1 },
  { code: 'words_100', title: '100 Words Learned', description: 'Bring 100 words to Familiar or better.', icon: 'languages', category: 'vocabulary', xp: 60, earned: (m) => m.wordsLearned >= 100 },
  { code: 'words_500', title: '500 Words Learned', description: 'Bring 500 words to Familiar or better.', icon: 'languages', category: 'vocabulary', xp: 200, earned: (m) => m.wordsLearned >= 500 },
  { code: 'words_1000', title: '1000 Words Learned', description: 'Bring 1000 words to Familiar or better.', icon: 'languages', category: 'vocabulary', xp: 400, earned: (m) => m.wordsLearned >= 1000 },
  { code: 'mastered_50', title: 'Deep Roots', description: 'Master 50 words.', icon: 'tree-deciduous', category: 'vocabulary', xp: 100, earned: (m) => m.wordsMastered >= 50 },
  { code: 'reviews_500', title: 'Memory Builder', description: 'Complete 500 vocabulary reviews.', icon: 'brain', category: 'vocabulary', xp: 100, earned: (m) => m.reviewsDone >= 500 },
  { code: 'custom_word', title: 'Collector', description: 'Add a word to your personal notebook.', icon: 'notebook-pen', category: 'vocabulary', xp: 10, earned: (m) => m.customWords >= 1 },
  { code: 'streak_7', title: '7-Day Streak', description: 'Study 7 scheduled days in a row.', icon: 'flame', category: 'streak', xp: 50, earned: (m) => m.longestStreak >= 7 },
  { code: 'streak_30', title: '30-Day Streak', description: 'Study 30 scheduled days in a row.', icon: 'flame', category: 'streak', xp: 200, earned: (m) => m.longestStreak >= 30 },
  { code: 'streak_100', title: '100-Day Streak', description: 'Study 100 scheduled days in a row.', icon: 'flame', category: 'streak', xp: 500, earned: (m) => m.longestStreak >= 100 },
  { code: 'first_speaking', title: 'First Words Out Loud', description: 'Complete your first speaking task.', icon: 'mic', category: 'skills', xp: 20, earned: (m) => m.speakingAttempts >= 1 },
  { code: 'speaking_25', title: 'Finding My Voice', description: 'Complete 25 speaking tasks.', icon: 'audio-lines', category: 'skills', xp: 120, earned: (m) => m.speakingAttempts >= 25 },
  { code: 'first_writing', title: 'First Draft', description: 'Submit your first piece of writing.', icon: 'pen-line', category: 'skills', xp: 20, earned: (m) => m.writingSubmissions >= 1 },
  { code: 'first_essay', title: 'First Essay', description: 'Write an essay or report of 150+ words.', icon: 'file-text', category: 'skills', xp: 60, earned: (m) => m.essays >= 1 },
  { code: 'first_conversation', title: 'Conversation Starter', description: 'Finish a conversation practice.', icon: 'messages-square', category: 'skills', xp: 30, earned: (m) => m.conversations >= 1 },
  { code: 'dictation_perfect', title: 'Sharp Ears', description: 'Write a dictation sentence perfectly.', icon: 'ear', category: 'skills', xp: 20, earned: (m) => m.dictationsPerfect >= 1 },
  { code: 'mistakes_10', title: 'Learning From Mistakes', description: 'Fix 10 mistakes from your notebook.', icon: 'wrench', category: 'skills', xp: 60, earned: (m) => m.mistakesFixed >= 10 },
  { code: 'first_game', title: 'Game On', description: 'Play your first mini game.', icon: 'gamepad-2', category: 'learning', xp: 10, earned: (m) => m.gamesPlayed >= 1 },
  { code: 'boss_win', title: 'Boss Defeated', description: 'Win a Daily Boss Battle.', icon: 'swords', category: 'learning', xp: 50, earned: (m) => m.bossWins >= 1 },
  { code: 'challenges_10', title: 'Challenge Accepted', description: 'Complete 10 daily challenges.', icon: 'target', category: 'learning', xp: 80, earned: (m) => m.challengesCompleted >= 10 },
  { code: 'first_module', title: 'First Module Completed', description: 'Pass your first module test.', icon: 'flag', category: 'milestone', xp: 100, earned: (m) => m.modulesCompleted >= 1 },
  { code: 'modules_10', title: 'Ten Modules Strong', description: 'Complete 10 modules.', icon: 'mountain', category: 'milestone', xp: 300, earned: (m) => m.modulesCompleted >= 10 },
  { code: 'b1plus_unlocked', title: 'B1+ Unlocked', description: 'Unlock the B1+ level.', icon: 'lock-open', category: 'milestone', xp: 150, earned: (m) => m.unlockedLevels.includes('B1+') },
  { code: 'b2_unlocked', title: 'B2 Unlocked', description: 'Unlock the B2 level.', icon: 'lock-open', category: 'milestone', xp: 250, earned: (m) => m.unlockedLevels.includes('B2') },
  { code: 'b2plus_unlocked', title: 'B2+ Unlocked', description: 'Unlock the B2+ level.', icon: 'lock-open', category: 'milestone', xp: 300, earned: (m) => m.unlockedLevels.includes('B2+') },
  { code: 'c1_unlocked', title: 'C1 Unlocked', description: 'Unlock the C1 level.', icon: 'lock-open', category: 'milestone', xp: 400, earned: (m) => m.unlockedLevels.includes('C1') },
  { code: 'c1_completed', title: 'C1 Completed', description: 'Pass the C1 level exam.', icon: 'trophy', category: 'milestone', xp: 1000, earned: (m) => m.levelsPassed.includes('C1') },
];

export function newlyEarned(metrics: AchievementMetrics, alreadyEarned: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !alreadyEarned.has(a.code) && a.earned(metrics)).map(({ earned: _e, ...def }) => def);
}
