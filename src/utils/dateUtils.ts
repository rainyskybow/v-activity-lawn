/**
 * 指定したDateオブジェクトまたはタイムスタンプから "YYYY-MM-DD" 形式の日付文字列を生成する
 */
export function formatDateString(dateInput: Date | number = new Date()): string {
  const d = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
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

  // 今週の週末（土曜、または日曜）までのオフセットを調整してカレンダーの最終日とする
  const targetEndDay = weekStartDay === 0 ? 6 : 0;
  let offsetToEndOfWeek = (targetEndDay - currentDayOfWeek + 7) % 7;
  const gridEndDate = new Date(endDate);
  gridEndDate.setDate(gridEndDate.getDate() + offsetToEndOfWeek);

  // 53週 × 7日 = 371日
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
