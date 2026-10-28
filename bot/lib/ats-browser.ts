import type { HostFilesApi } from "@grok/agent-sdk";
import { CONFIRMATION, NEXT_NAMES, SUBMIT_NAMES, classifyAts, isLoginWallText } from "./ats.js";
import type { FormField } from "./linkedin.js";
import { collectFields, fillField, openLinkedIn } from "./linkedin-browser.js";

export type ExternalApplyOutcome = {
  status: "applied" | "already_applied" | "skipped" | "blocked" | "preview";
  applyUrl: string;
  ats: string;
  blockers: string[];
  filled: string[];
  detail: string;
};

async function dismissBanners(page: import("playwright").Page): Promise<void> {
  const names = [/accept all/i, /^accept$/i, /i agree/i, /got it/i, /close/i];
  for (const name of names) {
    const button = page.getByRole("button", { name });
    if (await button.first().isVisible().catch(() => false)) {
      await button.first().click().catch(() => undefined);
    }
  }
}

async function loginWall(page: import("playwright").Page): Promise<string | null> {
  const heading = page.getByRole("heading", {
    name: /sign in|log in|create account|new user/i,
  });
  if (await heading.first().isVisible().catch(() => false)) {
    const text = (await heading.first().innerText().catch(() => "")) || "Sign-in wall";
    if (isLoginWallText(text) || /sign in|log in|create account/i.test(text)) {
      return `ATS requires an account first (${new URL(page.url()).hostname}). Sign in in this Chrome profile, then retry.`;
    }
  }
  if (/login|signin|sign-in/i.test(page.url()) && /workday/i.test(page.url())) {
    return "Workday sign-in is required. Sign in in Chrome, then retry external_apply.";
  }
  return null;
}

export async function applyExternalAts(
  files: HostFilesApi,
  input: {
    applyUrl: string;
    submit: boolean;
    answers: (field: FormField) => { kind: "answer"; value: string } | { kind: "skip" } | { kind: "blocked"; reason: string };
    resumeFilePath?: string;
  },
): Promise<ExternalApplyOutcome> {
  const ats = classifyAts(input.applyUrl);
  const opened = await openLinkedIn(files);
  try {
    await opened.page.goto(input.applyUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissBanners(opened.page);
    const wall = await loginWall(opened.page);
    if (wall) {
      return {
        status: "blocked",
        applyUrl: opened.page.url(),
        ats,
        blockers: [wall],
        filled: [],
        detail: wall,
      };
    }
    if (await opened.page.getByText(CONFIRMATION).first().isVisible().catch(() => false)) {
      return {
        status: "already_applied",
        applyUrl: opened.page.url(),
        ats,
        blockers: [],
        filled: [],
        detail: "This ATS page already shows a submitted application.",
      };
    }

    const filled: string[] = [];
    const blockers: string[] = [];
    for (let step = 0; step < 10; step += 1) {
      if (await opened.page.getByText(CONFIRMATION).first().isVisible().catch(() => false)) {
        await opened.persist();
        return {
          status: "applied",
          applyUrl: opened.page.url(),
          ats,
          blockers,
          filled,
          detail: `${ats} confirmed the application.`,
        };
      }
      const fields = await collectFields(opened.page);
      for (const field of fields) {
        const decision = input.answers(field);
        if (decision.kind === "blocked") blockers.push(decision.reason);
        if (decision.kind === "answer") {
          await fillField(opened.page, field, decision.value, input.resumeFilePath);
          filled.push(field.label);
        }
      }
      if (blockers.length > 0) {
        return {
          status: "blocked",
          applyUrl: opened.page.url(),
          ats,
          blockers,
          filled,
          detail: "Stopped before submit. Save answers on the profile or packet, then retry.",
        };
      }

      const submit = opened.page.getByRole("button", { name: SUBMIT_NAMES });
      if (await submit.first().isVisible().catch(() => false)) {
        if (!input.submit) {
          return {
            status: "preview",
            applyUrl: opened.page.url(),
            ats,
            blockers,
            filled,
            detail: `Filled the ${ats} form. Re-call with submit true after approval.`,
          };
        }
        await submit.first().click();
        await opened.page.waitForTimeout(1500);
        await opened.persist();
        const confirmed = await opened.page.getByText(CONFIRMATION).first().isVisible().catch(() => false);
        return {
          status: "applied",
          applyUrl: opened.page.url(),
          ats,
          blockers,
          filled,
          detail: confirmed
            ? `${ats} confirmed the application.`
            : "Submit clicked. Confirmation was not seen; verify on the ATS page.",
        };
      }

      const next = opened.page.getByRole("button", { name: NEXT_NAMES });
      if (await next.first().isVisible().catch(() => false)) {
        await next.first().click();
        await opened.page.waitForTimeout(800);
        continue;
      }
      break;
    }
    return {
      status: "blocked",
      applyUrl: opened.page.url(),
      ats,
      blockers: blockers.length > 0 ? blockers : ["Could not find a submit button on this ATS page."],
      filled,
      detail: `${ats} form did not reach submit. Company sites vary; add screening answers and retry, or apply this one by hand.`,
    };
  } finally {
    await opened.close();
  }
}
