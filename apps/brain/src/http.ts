import Fastify, { type FastifyInstance } from 'fastify';
import { JobSchema, type Job } from '@aura/contract';
import { z } from 'zod';

const NewJobSchema = z.object({
  type: JobSchema.shape.type,
  target: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export interface HttpDeps {
  enqueue: (job: Job) => void;
  genId: () => string;
}

export function buildHttp(deps: HttpDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.post('/jobs', async (req, reply) => {
    const parsed = NewJobSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid job' });
    const job = JobSchema.parse({ id: deps.genId(), ...parsed.data });
    deps.enqueue(job);
    return { id: job.id };
  });
  return app;
}
