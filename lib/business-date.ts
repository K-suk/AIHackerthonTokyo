// 営業日の計算。日本時間で午前4時を日付の区切りとする（0時〜4時は前日扱い）。
// 深夜営業でも「その日の売上」が1つの営業日にまとまるようにするため。

const CUTOFF_HOUR = 4; // 仮値（7章 未決事項）。変える場合はここだけ直す。

// 日本時間での各フィールドを取り出す（タイムゾーンに依存しない方法）。
function tokyoParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  // Intl は 24時を "24" で返すことがあるため 0 に正規化する。
  const hour = Number(get("hour")) % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour };
}

// 営業日を YYYY-MM-DD（日本時間）で返す。
export function toBusinessDate(date: Date): string {
  const { year, month, day, hour } = tokyoParts(date);
  const base = `${year}-${month}-${day}`;
  if (hour >= CUTOFF_HOUR) return base;
  // 区切り時刻より前なら前日の営業日。
  const previous = new Date(`${base}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}
