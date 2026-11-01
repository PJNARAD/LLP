import { Progress, StudyDayActivity, StudyStreakInfo } from '../types';

/**
 * Computes study streaks and daily study heatmap matrix from local progress records.
 */
export function computeStudyStreakAndActivity(
  allProgress: Progress[],
  nowMs: number = Date.now()
): {
  streakInfo: StudyStreakInfo;
  activityHistory: StudyDayActivity[];
  activityMap: Map<string, StudyDayActivity>;
} {
  const activityMap = new Map<string, { count: number; watchTimeSec: number; hours: number[] }>();
  const weekdayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const hourCounts: number[] = new Array(24).fill(0);

  // Aggregate progress records into day buckets
  for (const p of allProgress) {
    if (!p.updatedAt || p.positionSec <= 0) continue;

    const date = new Date(p.updatedAt);
    const dateStr = formatDateKey(date);

    const weekday = date.getDay();
    weekdayCounts[weekday] = (weekdayCounts[weekday] || 0) + 1;

    const hour = date.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;

    const existing = activityMap.get(dateStr) || { count: 0, watchTimeSec: 0, hours: [] };
    existing.count += 1;
    existing.watchTimeSec += p.positionSec;
    existing.hours.push(hour);
    activityMap.set(dateStr, existing);
  }

  // Find peak day of week
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let peakWeekdayIdx = 0;
  let maxWeekdayCount = -1;
  for (let i = 0; i < 7; i++) {
    if (weekdayCounts[i] > maxWeekdayCount) {
      maxWeekdayCount = weekdayCounts[i];
      peakWeekdayIdx = i;
    }
  }
  const peakDayOfWeek = maxWeekdayCount > 0 ? weekdayNames[peakWeekdayIdx] : 'Flexible';

  // Find peak hour range (3-hour window)
  let peakHourWindow = 18;
  let maxHourSum = -1;
  for (let h = 0; h < 22; h++) {
    const sum = hourCounts[h] + hourCounts[h + 1] + hourCounts[h + 2];
    if (sum > maxHourSum) {
      maxHourSum = sum;
      peakHourWindow = h;
    }
  }
  const peakHourRange =
    maxHourSum > 0
      ? `${String(peakHourWindow).padStart(2, '0')}:00 - ${String(peakHourWindow + 3).padStart(2, '0')}:00`
      : 'Anytime';

  // Calculate streaks from unique sorted dates
  const activeDateStrings = Array.from(activityMap.keys()).sort();
  const activeDateSet = new Set(activeDateStrings);
  const totalActiveDays = activeDateStrings.length;

  const today = new Date(nowMs);
  const todayStr = formatDateKey(today);
  const yesterday = new Date(nowMs - 86400 * 1000);
  const yesterdayStr = formatDateKey(yesterday);

  let currentStreakDays = 0;
  let longestStreakDays = 0;

  // Compute current streak: start from today (or yesterday if no activity today yet) and count backwards
  let checkDate = new Date(nowMs);
  let checkStr = formatDateKey(checkDate);

  if (!activeDateSet.has(checkStr)) {
    // If nothing today, check yesterday
    checkDate = new Date(nowMs - 86400 * 1000);
    checkStr = formatDateKey(checkDate);
  }

  while (activeDateSet.has(checkStr)) {
    currentStreakDays++;
    checkDate = new Date(checkDate.getTime() - 86400 * 1000);
    checkStr = formatDateKey(checkDate);
  }

  // Compute longest streak by scanning sorted dates
  let tempStreak = 0;
  let prevDateMs: number | null = null;

  for (const dStr of activeDateStrings) {
    const d = parseDateKey(dStr);
    const dMs = d.getTime();

    if (prevDateMs === null) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((dMs - prevDateMs) / (86400 * 1000));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }
    prevDateMs = dMs;
    if (tempStreak > longestStreakDays) {
      longestStreakDays = tempStreak;
    }
  }

  longestStreakDays = Math.max(longestStreakDays, currentStreakDays);

  // Generate continuous past 84-day (12 weeks) calendar array for heatmap
  const activityHistory: StudyDayActivity[] = [];
  const daysToShow = 91; // 13 full weeks
  const endDate = new Date(nowMs);
  // Normalize end date to end of week (Saturday)
  const dayOfWeek = endDate.getDay();
  const daysToSaturday = 6 - dayOfWeek;
  const gridEndDate = new Date(endDate.getTime() + daysToSaturday * 86400 * 1000);

  const finalActivityMap = new Map<string, StudyDayActivity>();

  for (let i = daysToShow - 1; i >= 0; i--) {
    const day = new Date(gridEndDate.getTime() - i * 86400 * 1000);
    const key = formatDateKey(day);
    const entry = activityMap.get(key);

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    const count = entry ? entry.count : 0;
    const watchSec = entry ? entry.watchTimeSec : 0;

    if (count > 0 || watchSec > 0) {
      if (count >= 8 || watchSec >= 3600) {
        level = 4;
      } else if (count >= 5 || watchSec >= 1800) {
        level = 3;
      } else if (count >= 3 || watchSec >= 900) {
        level = 2;
      } else {
        level = 1;
      }
    }

    const activity: StudyDayActivity = {
      dateStr: key,
      count,
      watchTimeSec: watchSec,
      level
    };

    activityHistory.push(activity);
    finalActivityMap.set(key, activity);
  }

  const streakInfo: StudyStreakInfo = {
    currentStreakDays,
    longestStreakDays,
    totalActiveDays,
    lastActiveDateStr: activeDateStrings.length > 0 ? activeDateStrings[activeDateStrings.length - 1] : null,
    peakDayOfWeek,
    peakHourRange
  };

  return {
    streakInfo,
    activityHistory,
    activityMap: finalActivityMap
  };
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
