// Parts of the app that are switched off for now. Their code, routes and data stay in place;
// flip a flag (and deploy) to bring one back.

export const FEATURES: { readonly dailyRack: boolean; readonly clips: boolean } = {
  /** Today's rack: the daily pass-three-tiles puzzle, its result, the streak and shared rack links. */
  dailyRack: true,
  /** Making a video clip of a daily rack result. Needs the daily rack too. */
  clips: false,
};
