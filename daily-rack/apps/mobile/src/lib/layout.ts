import { useWindowDimensions } from 'react-native';

// Screen sizes, so phones, iPads (portrait and landscape) and desktop browsers each get a
// layout that fits: a phone column, a roomier tablet column, or two columns side by side.

/** Width of the tab sidebar on big screens. */
export const SIDEBAR_WIDTH = 240;

export interface Layout {
  width: number;
  height: number;
  /** A tablet-sized screen (iPad, Android tablet, desktop browser). */
  tablet: boolean;
  landscape: boolean;
  /** Room for two columns side by side. */
  wide: boolean;
  /** The tab bar moves to a sidebar. */
  sidebar: boolean;
  /** Max width of a screen's column; `wideColumn` for screens laid out in two columns. */
  column: number;
  wideColumn: number;
  /** Usable width inside a standard column (after the 20 pt side padding). */
  contentWidth: number;
}

export function layoutFor(width: number, height: number): Layout {
  const tablet = Math.min(width, height) >= 600;
  const sidebar = width >= 1000;
  const available = width - (sidebar ? SIDEBAR_WIDTH : 0);
  const wide = available >= 840;
  const column = Math.min(available, tablet ? 720 : 560);
  const wideColumn = Math.min(available, wide ? 1100 : column);
  return { width, height, tablet, landscape: width > height, wide, sidebar, column, wideColumn, contentWidth: column - 40 };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
