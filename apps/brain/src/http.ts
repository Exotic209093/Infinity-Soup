import Fastify, { type FastifyInstance } from 'fastify';
import { JobSchema, type Job } from '@aura/contract';
import type { LeadSummary, LeadDetail, Overview, CampaignSummary, CampaignDetail } from '@aura/contract';
import { z } from 'zod';

const NewJobSchema = z.object({
  type: JobSchema.shape.type,
  target: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export interface HttpDeps {
  /** Returns true iff a hands client was connected and received the job immediately. */
  enqueue: (job: Job) => boolean;
  genId: () => string;
  listLeads: () => LeadSummary[];
  getLead: (id: string) => LeadDetail | null;
  leadsCsv: () => string;
  getOverview: () => Overview;
  listCampaigns: () => CampaignSummary[];
  getCampaign: (id: string) => CampaignDetail | null;
}

export function buildHttp(deps: HttpDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.post('/jobs', async (req, reply) => {
    const parsed = NewJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid job' });
    const job = JobSchema.parse({ id: deps.genId(), ...parsed.data });
    const delivered = deps.enqueue(job);
    // `delivered: false` means no extension/hands is connected — the job is persisted but won't
    // run until one connects (ad-hoc scrape jobs aren't re-dispatched), so callers can warn.
    return { id: job.id, delivered };
  });
  app.get('/leads', async () => deps.listLeads());
  app.get('/leads.csv', async (_req, reply) => {
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="leads.csv"');
    return deps.leadsCsv();
  });
  app.get<{ Params: { id: string } }>('/leads/:id', async (req, reply) => {
    const lead = deps.getLead(req.params.id);
    if (!lead) return reply.code(404).send({ error: 'not found' });
    return lead;
  });
  app.get('/overview', async () => deps.getOverview());
  app.get('/campaigns', async () => deps.listCampaigns());
  app.get<{ Params: { id: string } }>('/campaigns/:id', async (req, reply) => {
    const c = deps.getCampaign(req.params.id);
    if (!c) return reply.code(404).send({ error: 'not found' });
    return c;
  });
  return app;
}
