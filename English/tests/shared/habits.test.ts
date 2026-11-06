import { describe, expect, it } from 'vitest';
import { emptyStreak, recordStudyDay, streakStatus, missedStudyDays } from '@shared/streak';
import { difficultyDecision, buildWeeklyFocus, weakSkills, type SkillStat } from '@shared/adaptive';
import { rankFor, newlyEarned, type AchievementMetrics } from '@shared/gamification';
import { estimateTimeline } from '@shared/timeline';

describe('streaks', () => {
  it('counts consecutive days for daily learners', () => {
    let s = emptyStreak();
    for (const d of ['2026-03-01', '2026-03-02', '2026-03-03']) s = recordStudyDay(s, d, 'daily').state;
    expect(s.current).toBe(3);
    expect(recordStudyDay(s, '2026-03-03', 'daily').state.current).toBe(3);
  });

  it('allows a one-day gap for every-other-day learners', () => {
    let s = emptyStreak();
    for (const d of ['2026-03-01', '2026-03-03', '2026-03-05']) s = recordStudyDay(s, d, 'alternate').state;
    expect(s.current).toBe(3);
    expect(recordStudyDay(s, '2026-03-05', 'daily').state.current).toBe(3);
  });

  it('restarts the counter but keeps the longest streak after a long break', () => {
    let s = emptyStreak();
    for (const d of ['2026-03-01', '2026-03-02', '2026-03-03']) s = recordStudyDay(s, d, 'daily').state;
    const u = recordStudyDay(s, '2026-03-10', 'daily');
    expect(u.restarted).toBe(true);
    expect(u.state.current).toBe(1);
    expect(u.state.longest).toBe(3);
  });

  it('earns freezes every 7 days and uses them to bridge a missed day', () => {
    let s = emptyStreak();
    for (let d = 1; d <= 7; d++) s = recordStudyDay(s, `2026-03-0${d}`, 'daily').state;
    expect(s.freezes).toBe(1);
    expect(streakStatus(s, '2026-03-09', 'daily')).toBe('protected');
    const u = recordStudyDay(s, '2026-03-09', 'daily');
    expect(u.freezesConsumed).toBe(1);
    expect(u.state.current).toBe(8);
    expect(u.state.freezes).toBe(0);
  });

  it('reports status gently', () => {
    const s = recordStudyDay(emptyStreak(), '2026-03-01', 'daily').state;
    expect(streakStatus(s, '2026-03-01', 'daily')).toBe('active');
    expect(streakStatus(s, '2026-03-02', 'daily')).toBe('at_risk');
    expect(streakStatus(s, '2026-03-04', 'daily')).toBe('broken');
    expect(missedStudyDays(2, 'alternate')).toBe(0);
    expect(missedStudyDays(3, 'daily')).toBe(2);
  });
});

describe('adaptive difficulty', () => {
  it('follows the 90/70/50 rules and never jumps more than one step', () => {
    expect(difficultyDecision(5, 0.95)).toEqual({ next: 6, action: 'increase' });
    expect(difficultyDecision(5, 0.8)).toEqual({ next: 5, action: 'maintain' });
    expect(difficultyDecision(5, 0.6)).toEqual({ next: 5, action: 'extra_practice' });
    expect(difficultyDecision(5, 0.3)).toEqual({ next: 4, action: 'review_prerequisites' });
    expect(difficultyDecision(10, 1).next).toBe(10);
    expect(difficultyDecision(1, 0).next).toBe(1);
  });

  const stats = (over: Partial<Record<string, Partial<SkillStat>>>): SkillStat[] =>
    (['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing'] as const).map((skill) => ({
      skill,
      accuracy: 0.8,
      responses: 20,
      estimate: 2.4,
      ...over[skill],
    }));

  it('detects weak skills by accuracy or level gap', () => {
    expect(weakSkills(stats({ listening: { accuracy: 0.55 } }))).toEqual(['listening']);
    expect(weakSkills(stats({ speaking: { estimate: 1.6, accuracy: null, responses: 0 } }))).toContain('speaking');
    expect(weakSkills(stats({}))).toEqual([]);
  });

  it('adds listening when reading is clearly stronger than listening', () => {
    const focus = buildWeeklyFocus(stats({ reading: { accuracy: 0.84 }, listening: { accuracy: 0.62 } }));
    expect(focus.extra.listening).toBe(2);
    expect(focus.messages[0]).toMatch(/written English better than spoken English/);
  });
});

describe('gamification', () => {
  it('computes rank and progress', () => {
    expect(rankFor(0).rank.title).toBe('Explorer');
    const r = rankFor(550);
    expect(r.rank.level).toBe(2);
    expect(r.progress).toBeCloseTo(0.5);
  });

  it('awards each achievement once', () => {
    const m: AchievementMetrics = {
      lessonsCompleted: 1, wordsLearned: 120, wordsMastered: 0, reviewsDone: 10, longestStreak: 7, speakingAttempts: 0,
      writingSubmissions: 0, essays: 0, modulesCompleted: 0, levelsPassed: [], unlockedLevels: ['B1'], perfectLessons: 0,
      gamesPlayed: 0, bossWins: 0, mistakesFixed: 0, customWords: 0, conversations: 0, dictationsPerfect: 0,
      placementDone: true, sessionsCompleted: 0, challengesCompleted: 0,
    };
    const codes = newlyEarned(m, new Set(['placement'])).map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['first_lesson', 'words_100', 'streak_7']));
    expect(codes).not.toContain('placement');
  });
});

describe('timeline', () => {
  it('gives a range in months and adapts to the schedule', () => {
    const daily = estimateTimeline({ remainingContentMinutes: 9000, minutesPerStudyDay: 30, schedule: 'daily' });
    const alternate = estimateTimeline({ remainingContentMinutes: 9000, minutesPerStudyDay: 30, schedule: 'alternate' });
    expect(daily.monthsHigh).toBeGreaterThan(daily.monthsLow);
    expect(alternate.monthsLow).toBeGreaterThan(daily.monthsLow);
    expect(daily.label).toMatch(/^approximately \d/);
  });

  it('uses recent pace when available', () => {
    const t = estimateTimeline({ remainingContentMinutes: 9000, minutesPerStudyDay: 30, schedule: 'daily', recentMinutesPerWeek: 60 });
    expect(t.basis).toBe('recent_pace');
  });
});
