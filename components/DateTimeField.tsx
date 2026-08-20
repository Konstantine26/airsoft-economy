import { useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { TextField } from './TextField';

type Props = {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (value: string) => void;
  style?: StyleProp<ViewStyle>;
};

function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

// Internal buffer is always in the order the user types: день, месяц, год, часы, минуты.
function displayFromBuffer(buffer: string): string {
  const day = buffer.slice(0, 2);
  const month = buffer.slice(2, 4);
  const year = buffer.slice(4, 8);
  const hour = buffer.slice(8, 10);
  const minute = buffer.slice(10, 12);
  let out = day;
  if (month) out += '-' + month;
  if (year) out += '-' + year;
  if (hour) out += ' ' + hour;
  if (minute) out += ':' + minute;
  return out;
}

// Reported value stays "ГГГГ-ММ-ДД ЧЧ:ММ" so the existing `new Date(value.trim())`
// parsing elsewhere in the app keeps working unchanged.
function storedFromBuffer(buffer: string): string {
  if (buffer.length < 8) return '';
  const day = buffer.slice(0, 2);
  const month = buffer.slice(2, 4);
  const year = buffer.slice(4, 8);
  const hour = buffer.slice(8, 10);
  const minute = buffer.slice(10, 12);
  let out = `${year}-${month}-${day}`;
  if (hour) out += ` ${hour}`;
  if (minute) out += `:${minute}`;
  return out;
}

// Reconstructs the day-order buffer from a value coming from outside: either
// this component's own "ГГГГ-ММ-ДД ЧЧ:ММ" stored shape, or a full ISO
// timestamptz straight from Supabase (e.g. game.starts_at, always UTC). The
// two need different handling -- an ISO string's digits are UTC clock digits,
// not the organizer's local wall-clock digits, so slicing them positionally
// like the plain shape would silently show the wrong hour after a UTC offset.
// Only convert through Date (and thus through the local timezone) for actual
// ISO input, detected by the "T" separator; the plain shape is left exactly
// as before since it's already local and Date-string-parsing beyond ISO 8601
// isn't guaranteed portable across JS engines (V8 vs Hermes on native).
function bufferFromStored(stored: string): string {
  const trimmed = stored.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        pad(parsed.getDate()) +
        pad(parsed.getMonth() + 1) +
        String(parsed.getFullYear()) +
        pad(parsed.getHours()) +
        pad(parsed.getMinutes())
      );
    }
  }
  const raw = digitsOf(trimmed).slice(0, 12);
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const rest = raw.slice(8, 12);
  return day + month + year + rest;
}

export function DateTimeField({ label, placeholder, value, onChangeText, style }: Props) {
  const [buffer, setBuffer] = useState(() => bufferFromStored(value));
  const lastEmitted = useRef(value);

  if (value !== lastEmitted.current) {
    lastEmitted.current = value;
    const nextBuffer = bufferFromStored(value);
    if (nextBuffer !== buffer) setBuffer(nextBuffer);
  }

  const handleChange = (text: string) => {
    const nextBuffer = digitsOf(text).slice(0, 12);
    setBuffer(nextBuffer);
    const stored = storedFromBuffer(nextBuffer);
    lastEmitted.current = stored;
    onChangeText(stored);
  };

  return (
    <TextField
      style={style}
      label={label}
      placeholder={placeholder ?? 'ДД-ММ-ГГГГ ЧЧ:ММ'}
      value={displayFromBuffer(buffer)}
      onChangeText={handleChange}
      keyboardType="number-pad"
      maxLength={16}
    />
  );
}
