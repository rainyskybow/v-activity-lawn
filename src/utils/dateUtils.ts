/**
 * タイムスタンプが妥当なエポックミリ秒であるか検証する
 */
export function isValidTimestamp(ts: unknown): ts is number {
  return typeof ts === 'number' && !isNaN(ts) && isFinite(ts) && ts > 0;
}

/**
 * 指定したDateオブジェクトまたはタイムスタンプから "YYYY-MM-DD" 形式の日付文字列を安全に生成する
 */
export function formatDateString(dateInput: Date | number = new Date()): string {
  let d: Date;
  if (typeof dateInput === 'number') {
    d = isValidTimestamp(dateInput) ? new Date(dateInput) : new Date();
  } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    d = dateInput;
  } else {
    d = new Date();
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 2つの日付の日数差を算出する (date2 - date1)
 */
export function diffDays(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(`${dateStr1}T00:00:00`);
  const d2 = new Date(`${dateStr2}T00:00:00`);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 指定した日付から何日前・何日後の日付文字列を計算する
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateString(d);
}

/**
 * 過去53週（約371日分）の日付配列（古い順）を生成する
 * @param endDateStr 終了基準日 (YYYY-MM-DD)。省略時は今日
 * @param weekStartDay 0: 日曜始まり, 1: 月曜始まり
 */
export function generatePast53WeeksGrid(
  endDateStr: string = formatDateString(),
  weekStartDay: 0 | 1 = 0
): string[] {
  const endDate = new Date(`${endDateStr}T00:00:00`);
  const currentDayOfWeek = endDate.getDay(); // 0: 日曜, 1: 月曜... 6: 土曜

  const targetEndDay = weekStartDay === 0 ? 6 : 0;
  let offsetToEndOfWeek = (targetEndDay - currentDayOfWeek + 7) % 7;
  const gridEndDate = new Date(endDate);
  gridEndDate.setDate(gridEndDate.getDate() + offsetToEndOfWeek);

  const totalDays = 53 * 7;
  const result: string[] = [];
  const iterDate = new Date(gridEndDate);
  iterDate.setDate(iterDate.getDate() - (totalDays - 1));

  for (let i = 0; i < totalDays; i++) {
    result.push(formatDateString(iterDate));
    iterDate.setDate(iterDate.getDate() + 1);
  }

  return result;
}

/**
 * 指定した年（1月1日〜12月31日を含む53週分）の日付配列（古い順）を生成する
 * @param year 対象年（例: 2025）
 * @param weekStartDay 0: 日曜始まり, 1: 月曜始まり
 */
export function generateYearGrid(year: number, weekStartDay: 0 | 1 = 0): string[] {
  const endDateStr = `${year}-12-31`;
  return generatePast53WeeksGrid(endDateStr, weekStartDay);
}
