import type { HostFilesApi } from "@grok/agent-sdk";
import {
  LOGIN_TIMEOUT_MS,
  STORAGE_STATE_PATH,
  type FormField,
  type LinkedInJob,
  linkedinIdFromUrl,
  linkedinSearchUrl,
} from "./linkedin.js";

const FILES_SCOPE = { scope: "deployment" as const };

type PlaywrightModule = typeof import("playwright");
type BrowserContext = import("playwright").BrowserContext;
type Page = import("playwright").Page;

export type SessionStatus = {
  mock: boolean;
  cdpUrl: string | null;
  storageStateSaved: boolean;
  headedAvailable: boolean;
  ready: boolean;
  hint: string;
};

export function cdpUrl(): string | null {
  return process.env.LINKEDIN_CDP_URL?.trim() || null;
}

export function userDataDir(): string {
  return (
    process.env.LINKEDIN_USER_DATA_DIR?.trim() ||
    `${process.env.HOME ?? "/tmp"}/.akshaya-job-search/chrome-profile`
  );
}

export function headedAvailable(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") return true;
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

export async function sessionStatus(files: HostFilesApi): Promise<SessionStatus> {
  const storageStateSaved = await files.exists(STORAGE_STATE_PATH, FILES_SCOPE);
  const cdp = cdpUrl();
  const headed = headedAvailable();
  const ready = Boolean(cdp) || storageStateSaved;
  let hint =
    "Call linkedin_session login on the laptop, or start Chrome with --remote-debugging-port=9222 and set LINKEDIN_CDP_URL.";
  if (cdp) hint = `Will attach to Chrome at ${cdp}.`;
  else if (storageStateSaved) hint = "Saved LinkedIn session found. Search and apply will reuse it.";
  else if (!headed) {
    hint =
      "No display and no Chrome debug port. Run `agent-sdk dev` on the laptop where Chrome is logged into LinkedIn.";
  }
  return {
    mock: false,
    cdpUrl: cdp,
    storageStateSaved,
    headedAvailable: headed,
    ready,
    hint,
  };
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install` and `npx playwright install chromium`.");
  }
}

async function readStorageState(
  files: HostFilesApi,
): Promise<import("playwright").BrowserContextOptions["storageState"] | undefined> {
  const raw = await files.read(STORAGE_STATE_PATH, FILES_SCOPE);
  if (!raw) return undefined;
  return JSON.parse(raw) as import("playwright").BrowserContextOptions["storageState"];
}

async function writeStorageState(files: HostFilesApi, context: BrowserContext): Promise<void> {
  const state = await context.storageState();
  await files.write(STORAGE_STATE_PATH, JSON.stringify(state), FILES_SCOPE);
}

type Opened = {
  page: Page;
  close: () => Promise<void>;
  persist: () => Promise<void>;
};

async function openLinkedIn(files: HostFilesApi): Promise<Opened> {
  const pw = await loadPlaywright();
  const cdp = cdpUrl();
  if (cdp) {
    const browser = await pw.chromium.connectOverCDP(cdp);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const existing = context
      .pages()
      .find((candidate) => /linkedin\.com/i.test(candidate.url()));
    const page = existing ?? (await context.newPage());
    return {
      page,
      persist: async () => {
        await writeStorageState(files, context);
      },
      close: async () => {
        await writeStorageState(files, context).catch(() => undefined);
        await browser.close();
      },
    };
  }

  const storageState = await readStorageState(files);
  if (!headedAvailable()) {
    throw new Error(
      "LinkedIn needs a local Chrome window. On your laptop: launch Chrome with --remote-debugging-port=9222, or run linkedin_session login. Headless apply from a cloud VM is refused.",
    );
  }

  if (storageState) {
    const browser = await pw.chromium.launch({
      headless: false,
      args: ["--disable-notifications"],
    });
    const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    return {
      page,
      persist: async () => {
        await writeStorageState(files, context);
      },
      close: async () => {
        await writeStorageState(files, context).catch(() => undefined);
        await browser.close();
      },
    };
  }

  const context = await pw.chromium.launchPersistentContext(userDataDir(), {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-notifications"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    page,
    persist: async () => {
      await writeStorageState(files, context);
    },
    close: async () => {
      await writeStorageState(files, context).catch(() => undefined);
      await context.close();
    },
  };
}

export async function loginLinkedIn(files: HostFilesApi): Promise<{ loggedIn: boolean; url: string }> {
  const opened = await openLinkedIn(files);
  try {
    await opened.page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    const email = process.env.LINKEDIN_EMAIL?.trim();
    const password = process.env.LINKEDIN_PASSWORD?.trim();
    if (email && password && (await opened.page.locator("#username").count())) {
      await opened.page.locator("#username").fill(email);
      await opened.page.locator("#password").fill(password);
      await opened.page.locator('button[type="submit"]').click();
    }
    await opened.page.waitForURL(/linkedin\.com\/(feed|jobs|in\/)/, { timeout: LOGIN_TIMEOUT_MS });
    await opened.persist();
    return { loggedIn: true, url: opened.page.url() };
  } finally {
    await opened.close();
  }
}

async function dismissNoise(page: Page): Promise<void> {
  const buttons = [
    page.getByRole("button", { name: /dismiss/i }),
    page.getByRole("button", { name: /not now/i }),
    page.getByRole("button", { name: /skip/i }),
    page.locator('button[aria-label="Dismiss"]'),
  ];
  for (const button of buttons) {
    try {
      if (await button.first().isVisible({ timeout: 400 })) {
        await button.first().click({ timeout: 500 });
      }
    } catch {
      // overlays are optional
    }
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  if (/linkedin\.com\/(login|checkpoint|uas\/)/i.test(page.url())) return false;
  const signIn = page.getByRole("link", { name: /^sign in$/i });
  return !(await signIn.first().isVisible().catch(() => false));
}

export async function searchLinkedInJobs(
  files: HostFilesApi,
  input: { keywords: string; location?: string; limit: number },
): Promise<LinkedInJob[]> {
  const opened = await openLinkedIn(files);
  try {
    await opened.page.goto(linkedinSearchUrl({ keywords: input.keywords, location: input.location }), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await dismissNoise(opened.page);
    if (!(await isLoggedIn(opened.page))) {
      throw new Error("LinkedIn session expired. Call linkedin_session login, then retry.");
    }
    await opened.page.waitForTimeout(1500);
    const jobs = await readJobCards(opened.page, input.limit);
    await opened.persist();
    return jobs;
  } finally {
    await opened.close();
  }
}

async function readJobCards(page: Page, limit: number): Promise<LinkedInJob[]> {
  const jobs: LinkedInJob[] = [];
  const cards = page.locator(
    "div.job-card-container, li.scaffold-layout__list-item, div[data-job-id], div[data-occludable-job-id]",
  );
  const total = Math.min(await cards.count(), limit);
  for (let index = 0; index < total; index += 1) {
    const card = cards.nth(index);
    try {
      const linkedinId =
        (await card.getAttribute("data-job-id")) ||
        (await card.getAttribute("data-occludable-job-id")) ||
        (await card.locator("[data-job-id]").first().getAttribute("data-job-id"));
      if (!linkedinId) continue;
      await card.click({ timeout: 5_000 });
      await page.waitForTimeout(800);
      const title =
        (await textOf(page.locator("h1").first())) ||
        (await textOf(card.locator("a.job-card-list__title, a.job-card-container__link").first()));
      const company =
        (await textOf(page.locator(".job-details-jobs-unified-top-card__company-name, a.job-details-jobs-unified-top-card__company-name").first())) ||
        (await textOf(card.locator(".job-card-container__primary-description, .artdeco-entity-lockup__subtitle").first()));
      const location =
        (await textOf(page.locator(".job-details-jobs-unified-top-card__tertiary-description-container, .jobs-unified-top-card__bullet").first())) ||
        undefined;
      const description =
        (await textOf(page.locator("#job-details, .jobs-description, .jobs-box__html-content").first())) ||
        title;
      const alreadyApplied = await page.getByText(/applied/i).first().isVisible().catch(() => false);
      const easyApply = await hasEasyApply(page);
      const url = page.url().includes(linkedinId)
        ? page.url()
        : `https://www.linkedin.com/jobs/view/${linkedinId}`;
      jobs.push({
        linkedinId,
        title: title || "Untitled role",
        company: company || "Unknown company",
        location,
        url,
        description: description.slice(0, 4000),
        easyApply,
        alreadyApplied,
      });
    } catch {
      continue;
    }
  }
  return jobs;
}

async function textOf(locator: import("playwright").Locator): Promise<string> {
  try {
    const value = (await locator.innerText({ timeout: 800 })).trim();
    return value;
  } catch {
    return "";
  }
}

async function hasEasyApply(page: Page): Promise<boolean> {
  const easy = page.getByRole("button", { name: /easy apply/i });
  if (await easy.first().isVisible().catch(() => false)) return true;
  const linkedinApply = page.locator('[aria-label^="LinkedIn Apply to"], button.jobs-apply-button');
  if (await linkedinApply.first().isVisible().catch(() => false)) return true;
  const external = page.getByRole("button", { name: /^apply$/i });
  return !(await external.first().isVisible().catch(() => false));
}

export type ApplyOutcome = {
  status: "applied" | "already_applied" | "skipped" | "blocked" | "preview";
  linkedinId: string;
  url: string;
  blockers: string[];
  filled: string[];
  detail: string;
};

export async function applyEasyApply(
  files: HostFilesApi,
  input: {
    url: string;
    submit: boolean;
    answers: (field: FormField) => { kind: "answer"; value: string } | { kind: "skip" } | { kind: "blocked"; reason: string };
    resumeFilePath?: string;
  },
): Promise<ApplyOutcome> {
  const linkedinId = linkedinIdFromUrl(input.url) ?? "unknown";
  const opened = await openLinkedIn(files);
  try {
    await opened.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissNoise(opened.page);
    if (!(await isLoggedIn(opened.page))) {
      throw new Error("LinkedIn session expired. Call linkedin_session login, then retry.");
    }
    if (await opened.page.getByText(/application submitted|already applied|applied \d/i).first().isVisible().catch(() => false)) {
      return {
        status: "already_applied",
        linkedinId,
        url: opened.page.url(),
        blockers: [],
        filled: [],
        detail: "LinkedIn shows this job as already applied.",
      };
    }
    const applyButton = await findApplyButton(opened.page);
    if (!applyButton) {
      return {
        status: "skipped",
        linkedinId,
        url: opened.page.url(),
        blockers: [],
        filled: [],
        detail: "No Easy Apply button. External ATS jobs are skipped.",
      };
    }
    await applyButton.click();
    await opened.page.waitForTimeout(800);

    const filled: string[] = [];
    const blockers: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      if (await sentConfirmation(opened.page)) {
        await opened.persist();
        return {
          status: "applied",
          linkedinId,
          url: opened.page.url(),
          blockers,
          filled,
          detail: "LinkedIn confirmed the application was sent.",
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
        await dismissModal(opened.page);
        return {
          status: "blocked",
          linkedinId,
          url: opened.page.url(),
          blockers,
          filled,
          detail: "Stopped before submit. Save answers on the profile or packet, then retry.",
        };
      }

      const submit = opened.page.getByRole("button", { name: /submit application/i });
      if (await submit.first().isVisible().catch(() => false)) {
        if (!input.submit) {
          await dismissModal(opened.page);
          return {
            status: "preview",
            linkedinId,
            url: opened.page.url(),
            blockers,
            filled,
            detail: "Form filled. Re-call with submit true after approval to send it.",
          };
        }
        await submit.first().click();
        await opened.page.waitForTimeout(1200);
        await opened.persist();
        const confirmed = await sentConfirmation(opened.page);
        return {
          status: confirmed ? "applied" : "applied",
          linkedinId,
          url: opened.page.url(),
          blockers,
          filled,
          detail: confirmed
            ? "LinkedIn confirmed the application was sent."
            : "Submit clicked. Confirmation banner was not seen; verify on LinkedIn.",
        };
      }

      const next = opened.page.getByRole("button", {
        name: /continue to next step|next|review your application|review/i,
      });
      if (await next.first().isVisible().catch(() => false)) {
        await next.first().click();
        await opened.page.waitForTimeout(700);
        continue;
      }
      break;
    }
    await dismissModal(opened.page);
    return {
      status: "blocked",
      linkedinId,
      url: opened.page.url(),
      blockers: blockers.length > 0 ? blockers : ["Could not find a Submit application button."],
      filled,
      detail: "Easy Apply modal did not reach submit.",
    };
  } finally {
    await opened.close();
  }
}

async function findApplyButton(page: Page): Promise<import("playwright").Locator | null> {
  const candidates = [
    page.getByRole("button", { name: /easy apply/i }),
    page.locator('[aria-label^="LinkedIn Apply to"]'),
    page.locator("button.jobs-apply-button"),
  ];
  for (const candidate of candidates) {
    if (await candidate.first().isVisible().catch(() => false)) return candidate.first();
  }
  return null;
}

async function sentConfirmation(page: Page): Promise<boolean> {
  return page.getByText(/application (was )?sent|applied to/i).first().isVisible().catch(() => false);
}

async function dismissModal(page: Page): Promise<void> {
  const dismiss = page.locator('button[aria-label="Dismiss"], button[aria-label="Close"]');
  if (await dismiss.first().isVisible().catch(() => false)) {
    await dismiss.first().click().catch(() => undefined);
    const discard = page.getByRole("button", { name: /discard/i });
    if (await discard.first().isVisible().catch(() => false)) {
      await discard.first().click().catch(() => undefined);
    }
  }
}

async function collectFields(page: Page): Promise<FormField[]> {
  return page.evaluate(() => {
    const roots: ParentNode[] = [document];
    const all = document.querySelectorAll("*");
    for (const node of all) {
      if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    const fields: FormField[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
      for (const labelEl of root.querySelectorAll("label")) {
        const label = (labelEl.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const controlId = labelEl.getAttribute("for");
        const control = controlId
          ? (root.querySelector(`#${CSS.escape(controlId)}`) as HTMLElement | null)
          : (labelEl.querySelector("input, textarea, select") as HTMLElement | null);
        const tag = control?.tagName.toLowerCase() ?? "";
        const typeAttr = (control as HTMLInputElement | null)?.type?.toLowerCase() ?? "";
        let type: FormField["type"] = "text";
        if (tag === "textarea") type = "textarea";
        else if (tag === "select") type = "select";
        else if (typeAttr === "radio") type = "radio";
        else if (typeAttr === "checkbox") type = "checkbox";
        else if (typeAttr === "file") type = "file";
        const required = Boolean(
          (control as HTMLInputElement | null)?.required || /\*/.test(label) || /required/i.test(label),
        );
        const options: string[] = [];
        if (tag === "select") {
          for (const option of (control as HTMLSelectElement).options) {
            const text = option.textContent?.trim();
            if (text) options.push(text);
          }
        }
        fields.push({ label, type, required, options: options.length > 0 ? options : undefined });
      }
    }
    return fields;
  });
}

async function fillField(
  page: Page,
  field: FormField,
  value: string,
  resumeFilePath?: string,
): Promise<void> {
  if (field.type === "file") {
    const path = value || resumeFilePath;
    if (!path) return;
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) await fileInput.setInputFiles(path);
    return;
  }
  const labeled = page.getByLabel(field.label, { exact: false });
  if (field.type === "select" && (await labeled.count())) {
    await labeled.first().selectOption({ label: value }).catch(async () => {
      await labeled.first().fill(value);
    });
    return;
  }
  if ((field.type === "radio" || field.type === "checkbox") && (await labeled.count())) {
    await labeled.first().click().catch(() => undefined);
    const option = page.getByRole("radio", { name: new RegExp(`^${escapeRegExp(value)}$`, "i") });
    if (await option.first().isVisible().catch(() => false)) await option.first().click();
    return;
  }
  if (await labeled.count()) {
    await labeled.first().fill(value).catch(() => undefined);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
