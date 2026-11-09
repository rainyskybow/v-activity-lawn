import { describe, it, expect } from 'vitest';
import { formatDateString, diffDays, addDays, generatePast53WeeksGrid, generateYearGrid } from '../src/utils/dateUtils';

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

  it('generateYearGrid が指定した年の1年間を含む371日分の日付配列を生成すること', () => {
    const grid2025 = generateYearGrid(2025, 0);
    expect(grid2025.length).toBe(371);
    // 2025-01-01 および 2025-12-31 が配列内に含まれること
    expect(grid2025.includes('2025-01-01')).toBe(true);
    expect(grid2025.includes('2025-12-31')).toBe(true);
  });
});
