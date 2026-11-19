/** Public links. Change here, nowhere else. */
export const CONFIG = {
  /** The repo, linked from "código aberto". */
  sourceUrl: "https://github.com/allbdev/the-single-hole",
  /**
   * Dig to Japan's Steam store page. Null hides the link until the page exists
   * (see TODO_FOR_YOU.md).
   */
  steamUrl: null as string | null,
  /** Room WebSocket URL; defaults to `/ws` on the same host. */
  roomUrl: (import.meta.env.VITE_ROOM_URL as string | undefined) ?? null,
};

export function roomUrl(location: Location): string {
  if (CONFIG.roomUrl) return CONFIG.roomUrl;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}
