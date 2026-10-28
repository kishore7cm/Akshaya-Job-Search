import type { AtsName } from "./store.js";

export type { AtsName };

const HOST_TO_ATS: Array<{ match: RegExp; ats: AtsName }> = [
  { match: /greenhouse\.io/i, ats: "greenhouse" },
  { match: /lever\.co/i, ats: "lever" },
  { match: /ashbyhq\.com/i, ats: "ashby" },
  { match: /myworkdayjobs\.com|myworkday\.com/i, ats: "workday" },
  { match: /smartrecruiters\.com/i, ats: "smartrecruiters" },
  { match: /icims\.com/i, ats: "icims" },
  { match: /workable\.com/i, ats: "workable" },
];

export function classifyAts(url: string): AtsName {
  try {
    const host = new URL(url).hostname;
    for (const row of HOST_TO_ATS) {
      if (row.match.test(host) || row.match.test(url)) return row.ats;
    }
  } catch {
    for (const row of HOST_TO_ATS) {
      if (row.match.test(url)) return row.ats;
    }
  }
  return "generic";
}

export function isLoginWallText(text: string): boolean {
  return /create (an )?account|sign in to apply|log in to apply|new candidate|forgot password/i.test(
    text,
  );
}

export const SUBMIT_NAMES = /submit application|submit your application|send application|^submit$|apply now/i;
export const NEXT_NAMES = /^(next|continue|save and continue|review)$/i;
export const CONFIRMATION = /thank you for applying|application (has been )?submitted|successfully applied|we received your application/i;
