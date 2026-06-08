import { z } from 'zod';

export const JobTypeSchema = z.enum([
  'visit', 'connect', 'message', 'follow', 'endorse', 'scrapeProfile', 'scrapeSearch',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobSchema = z.object({
  id: z.string(),
  type: JobTypeSchema,
  target: z.string(),
  payload: z.record(z.unknown()).default({}),
});
export type Job = z.infer<typeof JobSchema>;

export const ResultSchema = z.object({
  jobId: z.string(),
  status: z.enum(['ok', 'failed', 'skipped']),
  data: z.record(z.unknown()).optional(),
  observed: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});
export type Result = z.infer<typeof ResultSchema>;

// WS frames: hands (client) <-> brain (server)
export const ClientHelloSchema = z.object({ kind: z.literal('hello'), token: z.string() });
export const ServerWelcomeSchema = z.object({ kind: z.literal('welcome') });
export const ServerJobSchema = z.object({ kind: z.literal('job'), job: JobSchema });
export const ClientResultSchema = z.object({ kind: z.literal('result'), result: ResultSchema });
// Heartbeat: the hands pings on a timer to keep its MV3 service worker alive (WS traffic resets
// Chrome's ~30s idle-kill timer); the brain answers pong. Carries no privileged data.
export const ClientPingSchema = z.object({ kind: z.literal('ping') });
export const ServerPongSchema = z.object({ kind: z.literal('pong') });

export const ClientFrameSchema = z.union([ClientHelloSchema, ClientResultSchema, ClientPingSchema]);
export const ServerFrameSchema = z.union([ServerWelcomeSchema, ServerJobSchema, ServerPongSchema]);
export type ClientFrame = z.infer<typeof ClientFrameSchema>;
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

export const ExperienceSchema = z.object({
  title: z.string(), company: z.string().default(''), employmentType: z.string().default(''),
  startDate: z.string().default(''), endDate: z.string().default(''), isCurrent: z.boolean().default(false),
  location: z.string().default(''), companyUrl: z.string().default(''), description: z.string().default(''),
});
export const EducationSchema = z.object({
  school: z.string(), degree: z.string().default(''), field: z.string().default(''),
  startYear: z.number().nullable().default(null), endYear: z.number().nullable().default(null),
});
export const SkillSchema = z.object({ name: z.string() });
export const CertificationSchema = z.object({ name: z.string(), issuer: z.string().default(''), issuedDate: z.string().default('') });

// A post / activity item scraped from the profile's recent-activity feed. All fields are
// best-effort and default so a partial parse still yields a usable post (text is the only
// thing that really matters for personalization).
export const PostSchema = z.object({
  urn: z.string().default(''),
  text: z.string().default(''),
  postedAt: z.string().default(''),   // as displayed on LinkedIn, e.g. "2w" / "3mo"
  url: z.string().default(''),
  likes: z.number().default(0),
  comments: z.number().default(0),
  reposts: z.number().default(0),
  isRepost: z.boolean().default(false),
});
export type Post = z.infer<typeof PostSchema>;

export const ScrapedProfileSchema = z.object({
  profileUrl: z.string(),
  fullName: z.string(),
  headline: z.string().default(''),
  location: z.string().default(''),
  about: z.string().default(''),
  currentCompany: z.string().default(''),
  currentTitle: z.string().default(''),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
  posts: z.array(PostSchema).default([]),
  connections: z.number().default(0),
  followers: z.number().default(0),
  openToWork: z.boolean().default(false),
});
export type ScrapedProfile = z.infer<typeof ScrapedProfileSchema>;

export const ExperienceViewSchema = z.object({ title: z.string(), company: z.string(), dates: z.string(), isCurrent: z.boolean() });
export const EducationViewSchema = z.object({ school: z.string(), years: z.string() });
export const PostViewSchema = z.object({ text: z.string(), postedAt: z.string(), url: z.string(), engagement: z.string() });

export const LeadSummarySchema = z.object({
  id: z.string(), fullName: z.string(), currentTitle: z.string(), currentCompany: z.string(),
  location: z.string(), expCount: z.number(), eduCount: z.number(), skillCount: z.number(),
  postCount: z.number(),
  updatedAt: z.number().nullable(),
});
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const LeadDetailSchema = z.object({
  id: z.string(), fullName: z.string(), headline: z.string(), location: z.string(),
  currentTitle: z.string(), currentCompany: z.string(), about: z.string(), profileUrl: z.string(),
  updatedAt: z.number().nullable(),
  connections: z.number(), followers: z.number(), openToWork: z.boolean(),
  experience: z.array(ExperienceViewSchema), education: z.array(EducationViewSchema), skills: z.array(z.string()),
  posts: z.array(PostViewSchema),
});
export type LeadDetail = z.infer<typeof LeadDetailSchema>;

// ── Campaigns + Overview views (dashboard) ──
export const EnrollmentViewSchema = z.object({
  id: z.string(), leadId: z.string(), leadName: z.string(),
  state: z.string(), currentNodeType: z.string(), connectionState: z.string(),
  nextRunAt: z.number().nullable(), attempts: z.number(),
});
export type EnrollmentView = z.infer<typeof EnrollmentViewSchema>;

export const NodeViewSchema = z.object({ id: z.string(), type: z.string(), config: z.record(z.unknown()) });
export const EdgeViewSchema = z.object({ id: z.string(), fromNodeId: z.string(), toNodeId: z.string(), condition: z.string() });

export const CampaignSummarySchema = z.object({
  id: z.string(), name: z.string(), status: z.string(), nodeCount: z.number(),
  counts: z.object({ active: z.number(), dispatched: z.number(), done: z.number(), failed: z.number(), total: z.number() }),
});
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;

export const CampaignDetailSchema = z.object({
  id: z.string(), name: z.string(), status: z.string(),
  nodes: z.array(NodeViewSchema), edges: z.array(EdgeViewSchema), enrollments: z.array(EnrollmentViewSchema),
});
export type CampaignDetail = z.infer<typeof CampaignDetailSchema>;

export const CapUsageSchema = z.object({ action: z.string(), used: z.number(), cap: z.number() });
export const ActivityItemSchema = z.object({ jobId: z.string(), type: z.string(), target: z.string(), status: z.string(), at: z.number().nullable() });
export const OverviewSchema = z.object({
  caps: z.array(CapUsageSchema),
  counts: z.object({ leads: z.number(), campaigns: z.number(), runningCampaigns: z.number(), activeEnrollments: z.number(), doneEnrollments: z.number() }),
  recentActivity: z.array(ActivityItemSchema),
});
export type Overview = z.infer<typeof OverviewSchema>;
