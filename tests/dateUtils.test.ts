import { describe, it, expect } from 'vitest';
import { formatDateString, diffDays, addDays, generatePast53WeeksGrid } from '../src/utils/dateUtils';

describe('dateUtils', () => {
  it('formatDateString が YYYY-MM-DD 形式の文字列を返すこと', () => {
    const d = new Date(2026, 10, 8); // 2026-11-08
    expect(formatDateString(d)).toBe('2026-11-08');
  });

  it('diffDays が日付の日数差を正確に計算すること', () => {
    expect(diffDays('2026-11-01', '2026-11-08')).toBe(7);
    expect(diffDays('2026-11-08', '2026-11-01')).toBe(-7);
    expect(diffDays('2026-11-08', '2026-11-08')).toBe(0);
  });

  it('addDays が日付の加減算を正確に行うこと', () => {
    expect(addDays('2026-11-01', 7)).toBe('2026-11-08');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });

  it('generatePast53WeeksGrid が 371日分（53週×7日）の日付配列を生成すること', () => {
    const gridSunday = generatePast53WeeksGrid('2026-11-08', 0);
    expect(gridSunday.length).toBe(371);

    const gridMonday = generatePast53WeeksGrid('2026-11-08', 1);
    expect(gridMonday.length).toBe(371);
  });
});
