import { supabase } from './supabase';
import { withRetry } from './retry';
import type { Database } from './database.types';

// Money RPCs that have an idempotent *_once twin (041_idempotent_money.sql).
export type MoneyRpc =
  | 'transfer_to_participant'
  | 'transfer_to_team'
  | 'transfer_funds'
  | 'revive_participant'
  | 'trader_charge_participant'
  | 'trader_charge_team'
  | 'distribute_to_participant'
  | 'deposit_to_team'
  | 'deposit_to_participant';

type Functions = Database['public']['Functions'];
type MoneyError = { message: string; code?: string };

// A fresh key per money *intent*: create it when the confirmation screen for
// a given recipient + amount appears, reuse it for every retry of that same
// intent, and make a new one once it succeeded or the amount/recipient
// changed. Uniqueness is all that matters (keys are scoped per user on the
// server), so Math.random is fine where crypto isn't available.
export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// PostgREST's "no such function" -- the server hasn't applied 041 yet.
function isMissingFunction(error: MoneyError) {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message);
}

// Runs a money RPC so it's safe to retry: through its *_once twin with the
// given request id, retrying transient network failures. A repeat of an
// intent that already went through comes back as success with no new row.
//
// Servers that haven't applied 041 yet fall back to the plain RPC, once,
// without retries -- the same behaviour as before this existed.
export async function callMoneyRpc<F extends MoneyRpc>(
  fn: F,
  args: Functions[F]['Args'],
  requestId: string
): Promise<{ error: MoneyError | null }> {
  const once = await withRetry(() =>
    // The *_once names aren't in the generated types; their args are the
    // original's plus p_request_id.
    (supabase.rpc as unknown as (name: string, a: object) => PromiseLike<{ data: unknown; error: MoneyError | null }>)(
      `${fn}_once`,
      { p_request_id: requestId, ...args }
    )
  );
  if (once.error && isMissingFunction(once.error)) {
    const { error } = await supabase.rpc(fn, args as never);
    return { error };
  }
  return { error: once.error };
}

const MESSAGES: [RegExp, string][] = [
  [/insufficient balance/i, 'Недостаточно денег на балансе'],
  [/amount must be positive/i, 'Сумма должна быть больше нуля'],
  [/economy is not enabled/i, 'В этом проекте экономика выключена'],
  [/project is archived/i, 'Проект в архиве — переводы закрыты'],
  [/cannot send money to yourself/i, 'Нельзя перевести деньги самому себе'],
  [/cannot charge yourself/i, 'Нельзя списать деньги с самого себя'],
  [/paid revival is not enabled/i, 'В этой игре платное воскрешение выключено'],
  [/revival cost is not configured/i, 'Для этой стороны не задана стоимость воскрешения'],
  [/only a trader|only a trader or commander/i, 'Этот участник не с вашей стороны — списать с него нельзя'],
  [/only admins can deposit/i, 'Пополнять может только администратор'],
  [/you can only fund your own team/i, 'Переводить можно только в свою команду'],
  [/from_team_id and to_team_id must differ/i, 'Выберите другую команду-получателя'],
  [/network|fetch|timeout|timed out/i, 'Нет связи с сервером. Попробуйте ещё раз — повтор не спишет деньги дважды'],
];

// Server exceptions are English developer text; show players what happened
// and what to do instead.
export function moneyErrorMessage(error: MoneyError): string {
  for (const [pattern, text] of MESSAGES) {
    if (pattern.test(error.message)) return text;
  }
  return error.message;
}
