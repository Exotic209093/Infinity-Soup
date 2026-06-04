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
