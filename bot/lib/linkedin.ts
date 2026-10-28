import type { HostKvApi } from "@grok/agent-sdk";
import type { ApplicationPacket, Profile } from "./store.js";

export const MAX_APPLY_PER_DAY = 15;
export const MAX_APPLY_PER_CALL = 3;
export const MAX_SEARCH_RESULTS = 10;
export const MIN_APPLY_GAP_MS = 60_000;
export const LOGIN_TIMEOUT_MS = 5 * 60_000;

export const STORAGE_STATE_PATH = "linkedin/storage-state.json";
export const RATE_PREFIX = "linkedin:rate:";

export type LinkedInJob = {
  linkedinId: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  description: string;
  easyApply: boolean;
  alreadyApplied: boolean;
};

export type FormField = {
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "file";
  required: boolean;
  options?: string[];
};

export type FieldDecision =
  | { kind: "answer"; value: string }
  | { kind: "skip" }
  | { kind: "blocked"; reason: string };

export type RateState = {
  day: string;
  count: number;
  lastAt?: string;
  jobIds: string[];
};

export function pacificDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function pipelineJobId(linkedinId: string): string {
  const digits = linkedinId.replace(/[^0-9]/g, "");
  return digits.length > 0 ? `linkedin-${digits}` : `linkedin-${linkedinId}`;
}

export function linkedinIdFromUrl(url: string): string | null {
  const view = url.match(/\/jobs\/view\/(\d+)/);
  if (view) return view[1];
  const current = url.match(/[?&]currentJobId=(\d+)/);
  if (current) return current[1];
  return null;
}

export function linkedinSearchUrl(input: {
  keywords: string;
  location?: string;
  easyApply?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("keywords", input.keywords);
  if (input.location) params.set("location", input.location);
  if (input.easyApply !== false) params.set("f_AL", "true");
  params.set("origin", "JOB_SEARCH_PAGE_JOB_FILTER");
  params.set("sortBy", "DD");
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] ?? fullName,
    last: parts.slice(1).join(" ") || parts[0] || fullName,
  };
}

function lookupAnswer(
  label: string,
  extra: { question: string; answer: string }[] | undefined,
): string | undefined {
  const needle = normalize(label);
  return extra?.find((row) => normalize(row.question) === needle || needle.includes(normalize(row.question)))
    ?.answer;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function answerField(
  field: FormField,
  profile: Profile,
  packet?: ApplicationPacket | null,
): FieldDecision {
  const label = normalize(field.label);
  if (label.length === 0) return { kind: "skip" };
  if (/follow (the )?company|stay up to date|share my profile/.test(label)) {
    return { kind: "skip" };
  }

  const mapped =
    lookupAnswer(field.label, packet?.screeningAnswers) ??
    lookupAnswer(field.label, profile.commonAnswers);
  if (mapped) return { kind: "answer", value: mapped };

  const { first, last } = splitName(profile.fullName);
  if (/^first name$|given name/.test(label)) return { kind: "answer", value: first };
  if (/^last name$|family name|surname/.test(label)) return { kind: "answer", value: last };
  if (/^full name$|^name$/.test(label)) return { kind: "answer", value: profile.fullName };
  if (/email/.test(label) && profile.email) return { kind: "answer", value: profile.email };
  if (/(phone|mobile|cell)/.test(label) && profile.phone) return { kind: "answer", value: profile.phone };
  if (/city/.test(label) && (profile.city || profile.locations[0])) {
    return { kind: "answer", value: profile.city ?? profile.locations[0] };
  }
  if (/country|nation/.test(label) && profile.country) {
    return { kind: "answer", value: profile.country };
  }
  if (/cover letter/.test(label) && packet?.coverLetter) {
    return { kind: "answer", value: packet.coverLetter };
  }
  if (/how many years|years of experience|years.?experience/.test(label) && profile.yearsExperience !== undefined) {
    return { kind: "answer", value: String(profile.yearsExperience) };
  }
  if (/sponsor|work authorization|visa|authorized to work/.test(label)) {
    if (profile.requiresSponsorship === undefined && !profile.workAuthorization) {
      return field.required
        ? { kind: "blocked", reason: `Need work-authorization answer for: ${field.label}` }
        : { kind: "skip" };
    }
    const needsSponsor = profile.requiresSponsorship === true;
    const authorized = /citizen|green card|authorized|no sponsorship/i.test(profile.workAuthorization ?? "");
    if (/sponsor/.test(label)) {
      return { kind: "answer", value: yesNo(field, needsSponsor) };
    }
    return { kind: "answer", value: yesNo(field, authorized || !needsSponsor) };
  }
  if (/relocat/.test(label) && profile.willingToRelocate !== undefined) {
    return { kind: "answer", value: yesNo(field, profile.willingToRelocate) };
  }
  if (field.type === "file") {
    if (profile.resumeFilePath) return { kind: "answer", value: profile.resumeFilePath };
    return { kind: "skip" };
  }

  if (field.required) {
    return { kind: "blocked", reason: `Unmapped required question: ${field.label}` };
  }
  return { kind: "skip" };
}

function yesNo(field: FormField, value: boolean): string {
  const options = field.options?.map((option) => option.trim()) ?? [];
  const yes = options.find((option) => /^yes$/i.test(option));
  const no = options.find((option) => /^no$/i.test(option));
  if (value) return yes ?? "Yes";
  return no ?? "No";
}

export async function readRate(kv: HostKvApi, now: Date): Promise<RateState> {
  const day = pacificDay(now);
  const raw = await kv.get(`${RATE_PREFIX}${day}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { day, count: 0, jobIds: [] };
  }
  const record = raw as { count?: unknown; lastAt?: unknown; jobIds?: unknown };
  return {
    day,
    count: typeof record.count === "number" ? record.count : 0,
    lastAt: typeof record.lastAt === "string" ? record.lastAt : undefined,
    jobIds: Array.isArray(record.jobIds)
      ? record.jobIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export async function assertCanApply(
  kv: HostKvApi,
  now: Date,
  linkedinId: string,
): Promise<RateState> {
  const rate = await readRate(kv, now);
  if (rate.jobIds.includes(linkedinId)) {
    throw new Error(`Already applied to LinkedIn job ${linkedinId} today.`);
  }
  if (rate.count >= MAX_APPLY_PER_DAY) {
    throw new Error(
      `Daily Easy Apply cap reached (${MAX_APPLY_PER_DAY} Pacific-time). Resume tomorrow.`,
    );
  }
  if (rate.lastAt) {
    const elapsed = now.getTime() - Date.parse(rate.lastAt);
    if (Number.isFinite(elapsed) && elapsed < MIN_APPLY_GAP_MS) {
      const waitSec = Math.ceil((MIN_APPLY_GAP_MS - elapsed) / 1000);
      throw new Error(`Wait ${waitSec}s between LinkedIn applies.`);
    }
  }
  return rate;
}

export async function recordApply(
  kv: HostKvApi,
  now: Date,
  linkedinId: string,
): Promise<RateState> {
  const rate = await readRate(kv, now);
  const next: RateState = {
    day: rate.day,
    count: rate.count + 1,
    lastAt: now.toISOString(),
    jobIds: [...rate.jobIds, linkedinId],
  };
  await kv.put(`${RATE_PREFIX}${rate.day}`, next);
  return next;
}

export function mockJobs(keywords: string): LinkedInJob[] {
  return [
    {
      linkedinId: "1001",
      title: `${keywords} (mock)`,
      company: "Acme",
      location: "Remote",
      url: "https://www.linkedin.com/jobs/view/1001",
      description: `Mock Easy Apply listing for ${keywords}.`,
      easyApply: true,
      alreadyApplied: false,
    },
  ];
}

export function isMockSession(purpose?: string): boolean {
  return process.env.LINKEDIN_MOCK === "1" || purpose === "eval";
}
