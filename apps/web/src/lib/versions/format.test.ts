import { describe, it, expect } from 'vitest';
import { versionAge, versionDay, versionTime, groupVersionsByDay } from './format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A fixed afternoon to measure from, so these don't drift with the clock
const NOW = new Date('2026-09-27T15:00:00Z').getTime();
const at = (offset: number) => NOW - offset;

describe('versionTime', () => {
  it('prints the clock time the version was taken', () => {
    expect(versionTime(NOW)).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe('versionDay', () => {
  it('names today and yesterday rather than dating them', () => {
    expect(versionDay(at(2 * HOUR), NOW)).toBe('Today');
    expect(versionDay(at(DAY), NOW)).toBe('Yesterday');
  });

  it('dates anything older', () => {
    expect(versionDay(at(5 * DAY), NOW)).toMatch(/22|September/);
  });

  it('counts calendar days, not elapsed hours', () => {
    // Local times: 01:00 and the 23:00 before it are two hours apart, but a
    // day heading has to call them different days.
    const oneAm = new Date(2026, 8, 27, 1, 0).getTime();
    const elevenPmBefore = new Date(2026, 8, 26, 23, 0).getTime();
    expect(versionDay(oneAm, oneAm)).toBe('Today');
    expect(versionDay(elevenPmBefore, oneAm)).toBe('Yesterday');
  });

  it('includes the year once it is a different one', () => {
    const lastYear = new Date('2025-11-02T09:00:00Z').getTime();
    expect(versionDay(lastYear, NOW)).toMatch(/2025/);
  });
});

describe('versionAge', () => {
  it('counts minutes and hours', () => {
    expect(versionAge(at(20_000), NOW)).toBe('just now');
    expect(versionAge(at(5 * MINUTE), NOW)).toBe('5m ago');
    expect(versionAge(at(3 * HOUR), NOW)).toBe('3h ago');
  });

  it('says nothing past a day, where the day heading already has', () => {
    expect(versionAge(at(2 * DAY), NOW)).toBeNull();
  });
});

describe('groupVersionsByDay', () => {
  it('groups consecutive versions under one heading, newest first', () => {
    const versions = [
      { id: 'd', createdAt: at(1 * HOUR) },
      { id: 'c', createdAt: at(3 * HOUR) },
      { id: 'b', createdAt: at(DAY) },
      { id: 'a', createdAt: at(4 * DAY) },
    ];

    const groups = groupVersionsByDay(versions, NOW);

    expect(groups.map((group) => group.day)).toEqual([
      'Today',
      'Yesterday',
      versionDay(at(4 * DAY), NOW),
    ]);
    expect(groups[0]!.versions.map((version) => version.id)).toEqual(['d', 'c']);
    expect(groups[1]!.versions.map((version) => version.id)).toEqual(['b']);
  });

  it('has nothing to group when there are no versions', () => {
    expect(groupVersionsByDay([], NOW)).toEqual([]);
  });
});
