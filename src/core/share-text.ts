import { progressToJapan } from "../../shared/depth";
import { translate, type Locale } from "../i18n";
import { formatCount, formatPercent } from "./format";

/** Everything printed on the share card. Numbers only: nothing about the player. */
export interface ShareCardText {
  title: string;
  kicker: string;
  mine: string;
  ofWorld: string;
  progress: string;
  domain: string;
  /** Plain-text version for copy-paste fallbacks. */
  plain: string;
}

export function shareCardText(
  locale: Locale,
  mineScoops: number,
  worldScoops: number,
  url: string,
): ShareCardText {
  const percent = formatPercent(progressToJapan(worldScoops), locale);
  const total = formatCount(worldScoops, locale);
  const mine = formatCount(mineScoops, locale);
  let domain = url;
  try {
    domain = new URL(url).host;
  } catch {
    // keep the raw string
  }
  return {
    title: translate(locale, "app.name"),
    kicker: translate(locale, "share.iDug"),
    mine,
    ofWorld: translate(locale, "share.ofWorld", { total }),
    progress: translate(locale, "share.progress", { percent }),
    domain,
    plain: translate(locale, "share.text", { mine, total, percent, url }),
  };
}
