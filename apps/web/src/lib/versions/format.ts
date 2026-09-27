import type { DocVersion } from '../versionApi';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The clock time a version was taken, e.g. "14:32" */
export function versionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Today" / "Yesterday" / "27 September" — the heading a version sits under */
export function versionDay(timestamp: number, now = Date.now()): string {
  const day = new Date(timestamp);
  const today = new Date(now);
  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysApart = Math.round((midnight(today) - midnight(day)) / (24 * HOUR));

  if (daysApart === 0) return 'Today';
  if (daysApart === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** How long ago, for the newest version's "last saved" line */
export function versionAge(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)}h ago`;
  return versionDay(timestamp, now);
}

export interface VersionDay {
  day: string;
  versions: DocVersion[];
}

/**
 * Group versions under day headings, newest first, so a long history reads as
 * a list of days rather than forty timestamps.
 */
export function groupVersionsByDay(versions: DocVersion[], now = Date.now()): VersionDay[] {
  const days: VersionDay[] = [];
  for (const version of versions) {
    const day = versionDay(version.createdAt, now);
    const current = days[days.length - 1];
    if (current?.day === day) {
      current.versions.push(version);
    } else {
      days.push({ day, versions: [version] });
    }
  }
  return days;
}
