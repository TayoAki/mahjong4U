// A web page can't take a picture of itself without a large extra library, so on the web
// reports attach a screenshot the player picks instead of capturing one.
export async function captureRaw(): Promise<null> {
  return null;
}
