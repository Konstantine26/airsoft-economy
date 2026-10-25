import { useWindowDimensions } from 'react-native';

// Above this width (desktop browser, landscape tablet) the phone layout
// stops working: rows stretch edge to edge and the tab bar ends up a thin
// strip at the bottom of a big screen. Wide layouts move navigation into a
// sidebar, cap the reading width and show sheets as centred dialogs.
export const WIDE_BREAKPOINT = 900;

// Comfortable reading width for the main column on wide screens.
export const CONTENT_MAX_WIDTH = 960;

export function useWideLayout() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
