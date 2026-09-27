// Kopecks only when there are any: "2 450 ₽", but "12,50 ₽".
const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number): string {
  return `${moneyFormatter.format(amount)} ₽`;
}

// Spelled out by hand instead of toLocaleString(): the output of the Intl
// date APIs differs between Hermes, iOS, Android and browsers (and follows
// the device locale), while the app is Russian-only.
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatTime(value: string | Date): string {
  const d = toDate(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "4 окт", or "4 окт 2025" when it's not the current year.
export function formatDate(value: string | Date): string {
  const d = toDate(value);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// "Сб, 4 окт · 09:00"
export function formatDateTime(value: string | Date): string {
  const d = toDate(value);
  return `${WEEKDAYS[d.getDay()]}, ${formatDate(d)} · ${formatTime(d)}`;
}

// "Сб, 4 окт · 09:00–17:00", or two full datetimes when the game spans days.
export function formatDateRange(start: string | Date, end?: string | Date | null): string {
  if (!end) return formatDateTime(start);
  const s = toDate(start);
  const e = toDate(end);
  const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  return sameDay ? `${formatDateTime(s)}–${formatTime(e)}` : `${formatDateTime(s)} — ${formatDateTime(e)}`;
}

// "5 мин", "1 ч 12 мин", "3 д 4 ч" -- the coarse span between now and a
// moment, without direction (see formatRelative for "через"/"назад").
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} д ${restHours} ч` : `${days} д`;
}

// "через 1 ч 12 мин" / "5 мин назад" / "сейчас".
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const diff = toDate(value).getTime() - now.getTime();
  if (Math.abs(diff) < 60000) return 'сейчас';
  return diff > 0 ? `через ${formatDuration(diff)}` : `${formatDuration(diff)} назад`;
}
