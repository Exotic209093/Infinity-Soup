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

export const ClientFrameSchema = z.union([ClientHelloSchema, ClientResultSchema]);
export const ServerFrameSchema = z.union([ServerWelcomeSchema, ServerJobSchema]);
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
});
export type ScrapedProfile = z.infer<typeof ScrapedProfileSchema>;

export const ExperienceViewSchema = z.object({ title: z.string(), company: z.string(), dates: z.string(), isCurrent: z.boolean() });
export const EducationViewSchema = z.object({ school: z.string(), years: z.string() });

export const LeadSummarySchema = z.object({
  id: z.string(), fullName: z.string(), currentTitle: z.string(), currentCompany: z.string(),
  location: z.string(), expCount: z.number(), eduCount: z.number(), skillCount: z.number(),
  updatedAt: z.number().nullable(),
});
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const LeadDetailSchema = z.object({
  id: z.string(), fullName: z.string(), headline: z.string(), location: z.string(),
  currentTitle: z.string(), currentCompany: z.string(), about: z.string(), profileUrl: z.string(),
  updatedAt: z.number().nullable(),
  experience: z.array(ExperienceViewSchema), education: z.array(EducationViewSchema), skills: z.array(z.string()),
});
export type LeadDetail = z.infer<typeof LeadDetailSchema>;
