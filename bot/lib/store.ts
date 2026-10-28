import type { HostKvApi } from "@grok/agent-sdk";
import * as z from "zod/v4";

export const JOB_STATUSES = [
  "sourced",
  "shortlisted",
  "drafted",
  "ready_to_apply",
  "applied",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPLY_KINDS = ["easy_apply", "external", "unknown"] as const;
export type ApplyKind = (typeof APPLY_KINDS)[number];

export const ATS_NAMES = [
  "linkedin",
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "icims",
  "workable",
  "generic",
] as const;
export type AtsName = (typeof ATS_NAMES)[number];

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  sourced: ["shortlisted", "drafted", "ready_to_apply", "applied", "rejected", "withdrawn"],
  shortlisted: ["drafted", "ready_to_apply", "applied", "sourced", "rejected", "withdrawn"],
  drafted: ["ready_to_apply", "applied", "shortlisted", "rejected", "withdrawn"],
  ready_to_apply: ["applied", "drafted", "rejected", "withdrawn"],
  applied: ["interviewing", "rejected", "withdrawn", "offer"],
  interviewing: ["offer", "rejected", "withdrawn", "applied"],
  offer: ["accepted", "rejected", "withdrawn", "interviewing"],
  accepted: ["withdrawn"],
  rejected: ["sourced", "shortlisted"],
  withdrawn: ["sourced", "shortlisted"],
};

export const profileSchema = z.object({
  fullName: z.string().min(1),
  targetRoles: z.array(z.string().min(1)).min(1),
  locations: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  yearsExperience: z.number().min(0).optional(),
  summary: z.string().min(1),
  constraints: z.array(z.string().min(1)).optional(),
  workAuthorization: z.string().optional(),
  requiresSponsorship: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),
  phone: z.string().optional(),
  email: z.string().min(3).optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  resumeFilePath: z.string().optional(),
  commonAnswers: z
    .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
    .optional(),
  links: z
    .array(z.object({ label: z.string().min(1), url: z.string().min(1) }))
    .optional(),
});

export type Profile = z.infer<typeof profileSchema>;

export const jobSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  url: z.string().optional(),
  source: z.string().optional(),
  description: z.string().min(1),
  status: z.enum(JOB_STATUSES),
  matchScore: z.number().min(0).max(100).optional(),
  matchReasons: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
  nextAction: z.string().optional(),
  followUpAt: z.string().optional(),
  appliedAt: z.string().optional(),
  applyKind: z.enum(APPLY_KINDS).optional(),
  applyUrl: z.string().optional(),
  ats: z.enum(ATS_NAMES).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Job = z.infer<typeof jobSchema>;

export const packetSchema = z.object({
  jobId: z.string().min(1),
  tailoredResume: z.string().min(1),
  coverLetter: z.string().min(1),
  screeningAnswers: z
    .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
    .optional(),
  notes: z.string().optional(),
  updatedAt: z.string(),
});

export type ApplicationPacket = z.infer<typeof packetSchema>;

export type TimelineEvent = {
  at: string;
  type: string;
  detail: string;
};

type JobIndex = { ids: string[] };

const PROFILE_KEY = "profile";
const INDEX_KEY = "jobs:index";

function jobKey(id: string): string {
  return `job:${id}`;
}

function packetKey(id: string): string {
  return `packet:${id}`;
}

function eventsKey(id: string): string {
  return `events:${id}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function slugId(company: string, title: string): string {
  const slug = `${company}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug.length > 0 ? slug : "job";
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: JobStatus): readonly JobStatus[] {
  return TRANSITIONS[from];
}

const DEFAULT_NEXT_ACTION: Record<JobStatus, string> = {
  sourced: "Score against the saved profile.",
  shortlisted: "Draft an application packet.",
  drafted: "Human reviews the packet, then mark ready_to_apply.",
  ready_to_apply: "Call linkedin_apply with submit true, or apply on the employer site.",
  applied: "Wait for confirmation; follow up in 3 days.",
  interviewing: "Prep from the packet; log the interview outcome.",
  offer: "Compare with other pipeline offers.",
  accepted: "Withdraw remaining active applications if needed.",
  rejected: "Optional: request feedback, then source more roles.",
  withdrawn: "Optional: reopen later or source a replacement.",
};

async function readIndex(kv: HostKvApi): Promise<JobIndex> {
  const raw = await kv.get(INDEX_KEY);
  if (raw === undefined) return { ids: [] };
  const parsed = z.object({ ids: z.array(z.string()) }).safeParse(raw);
  return parsed.success ? parsed.data : { ids: [] };
}

async function writeIndex(kv: HostKvApi, index: JobIndex): Promise<void> {
  await kv.put(INDEX_KEY, index);
}

async function readEvents(kv: HostKvApi, jobId: string): Promise<TimelineEvent[]> {
  const raw = await kv.get(eventsKey(jobId));
  if (raw === undefined) return [];
  const parsed = z
    .array(z.object({ at: z.string(), type: z.string(), detail: z.string() }))
    .safeParse(raw);
  return parsed.success ? parsed.data : [];
}

async function appendEvent(
  kv: HostKvApi,
  jobId: string,
  type: string,
  detail: string,
): Promise<TimelineEvent> {
  const event: TimelineEvent = { at: nowIso(), type, detail };
  const events = await readEvents(kv, jobId);
  events.push(event);
  await kv.put(eventsKey(jobId), events);
  return event;
}

export async function getProfile(kv: HostKvApi): Promise<Profile | null> {
  const raw = await kv.get(PROFILE_KEY);
  if (raw === undefined) return null;
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Stored profile is invalid. Save the profile again.");
  }
  return parsed.data;
}

export async function saveProfile(kv: HostKvApi, profile: Profile): Promise<Profile> {
  await kv.put(PROFILE_KEY, profile);
  return profile;
}

export async function getJob(kv: HostKvApi, id: string): Promise<Job | null> {
  const raw = await kv.get(jobKey(id));
  if (raw === undefined) return null;
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Stored job ${id} is invalid. Re-save it with pipeline upsert.`);
  }
  return parsed.data;
}

export async function listJobs(
  kv: HostKvApi,
  status?: JobStatus,
): Promise<Job[]> {
  const { ids } = await readIndex(kv);
  const jobs: Job[] = [];
  for (const id of ids) {
    const job = await getJob(kv, id);
    if (job && (status === undefined || job.status === status)) {
      jobs.push(job);
    }
  }
  return jobs.sort((a, b) => {
    const score = (b.matchScore ?? -1) - (a.matchScore ?? -1);
    if (score !== 0) return score;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function upsertJob(
  kv: HostKvApi,
  input: {
    id?: string;
    title: string;
    company: string;
    location?: string;
    url?: string;
    source?: string;
    description: string;
    applyKind?: ApplyKind;
    applyUrl?: string;
    ats?: AtsName;
  },
): Promise<{ job: Job; created: boolean }> {
  const id = input.id ?? slugId(input.company, input.title);
  const existing = await getJob(kv, id);
  const timestamp = nowIso();
  const job: Job = {
    id,
    title: input.title,
    company: input.company,
    location: input.location,
    url: input.url,
    source: input.source,
    description: input.description,
    status: existing?.status ?? "sourced",
    matchScore: existing?.matchScore,
    matchReasons: existing?.matchReasons,
    gaps: existing?.gaps,
    nextAction: existing?.nextAction,
    followUpAt: existing?.followUpAt,
    appliedAt: existing?.appliedAt,
    applyKind: input.applyKind ?? existing?.applyKind,
    applyUrl: input.applyUrl ?? existing?.applyUrl,
    ats: input.ats ?? existing?.ats,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await kv.put(jobKey(id), job);
  const index = await readIndex(kv);
  if (!index.ids.includes(id)) {
    index.ids.push(id);
    await writeIndex(kv, index);
  }
  await appendEvent(
    kv,
    id,
    existing ? "updated" : "sourced",
    existing ? "Updated job listing." : `Sourced ${job.title} at ${job.company}.`,
  );
  return { job, created: existing === null };
}

export async function scoreJob(
  kv: HostKvApi,
  input: {
    id: string;
    matchScore: number;
    matchReasons: string[];
    gaps: string[];
    nextAction?: string;
  },
): Promise<Job> {
  const job = await getJob(kv, input.id);
  if (!job) throw new Error(`Unknown job: ${input.id}`);
  const updated: Job = {
    ...job,
    matchScore: input.matchScore,
    matchReasons: input.matchReasons,
    gaps: input.gaps,
    nextAction: input.nextAction ?? job.nextAction,
    updatedAt: nowIso(),
  };
  await kv.put(jobKey(job.id), updated);
  await appendEvent(
    kv,
    job.id,
    "scored",
    `Match score ${input.matchScore}. ${input.matchReasons[0] ?? ""}`.trim(),
  );
  return updated;
}

export async function setJobStatus(
  kv: HostKvApi,
  input: {
    id: string;
    status: JobStatus;
    note?: string;
    nextAction?: string;
    followUpAt?: string;
  },
): Promise<Job> {
  const job = await getJob(kv, input.id);
  if (!job) throw new Error(`Unknown job: ${input.id}`);
  if (!canTransition(job.status, input.status)) {
    throw new Error(
      `Cannot move ${job.id} from ${job.status} to ${input.status}. Allowed: ${allowedTransitions(job.status).join(", ")}.`,
    );
  }
  const timestamp = nowIso();
  const updated: Job = {
    ...job,
    status: input.status,
    nextAction: input.nextAction ?? DEFAULT_NEXT_ACTION[input.status],
    followUpAt: input.followUpAt ?? job.followUpAt,
    appliedAt: input.status === "applied" ? (job.appliedAt ?? timestamp) : job.appliedAt,
    updatedAt: timestamp,
  };
  await kv.put(jobKey(job.id), updated);
  await appendEvent(
    kv,
    job.id,
    "status",
    input.note ?? `Status ${job.status} → ${input.status}.`,
  );
  return updated;
}

export async function getPacket(
  kv: HostKvApi,
  jobId: string,
): Promise<ApplicationPacket | null> {
  const raw = await kv.get(packetKey(jobId));
  if (raw === undefined) return null;
  const parsed = packetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Stored packet for ${jobId} is invalid. Save it again.`);
  }
  return parsed.data;
}

export async function savePacket(
  kv: HostKvApi,
  packet: Omit<ApplicationPacket, "updatedAt">,
): Promise<{ packet: ApplicationPacket; job: Job }> {
  const job = await getJob(kv, packet.jobId);
  if (!job) throw new Error(`Unknown job: ${packet.jobId}`);
  const saved: ApplicationPacket = { ...packet, updatedAt: nowIso() };
  await kv.put(packetKey(job.id), saved);
  await appendEvent(kv, job.id, "packet", "Saved tailored resume and cover letter.");
  if (job.status === "sourced" || job.status === "shortlisted") {
    const drafted = await setJobStatus(kv, {
      id: job.id,
      status: "drafted",
      note: "Application packet drafted.",
      nextAction: "Review packet, then mark ready_to_apply.",
    });
    return { packet: saved, job: drafted };
  }
  const refreshed = await getJob(kv, job.id);
  if (!refreshed) throw new Error(`Unknown job: ${job.id}`);
  return { packet: saved, job: refreshed };
}

export async function getTimeline(
  kv: HostKvApi,
  jobId: string,
): Promise<TimelineEvent[]> {
  return readEvents(kv, jobId);
}

export function boardFromJobs(jobs: Job[]): Record<JobStatus, Job[]> {
  const board = Object.fromEntries(JOB_STATUSES.map((status) => [status, [] as Job[]])) as Record<
    JobStatus,
    Job[]
  >;
  for (const job of jobs) board[job.status].push(job);
  return board;
}
