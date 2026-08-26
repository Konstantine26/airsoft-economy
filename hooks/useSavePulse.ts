import { useCallback, useState } from 'react';

// Pairs with Button's `successPulse` prop: call `trigger()` right after a
// successful save to flash the button's green checkmark.
export function useSavePulse() {
  const [pulse, setPulse] = useState(0);
  const trigger = useCallback(() => setPulse((p) => p + 1), []);
  return [pulse, trigger] as const;
}
