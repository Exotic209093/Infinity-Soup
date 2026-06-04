import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  target: text('target').notNull(),
  payload: text('payload').notNull().default('{}'),
  status: text('status').notNull().default('queued'),
  result: text('result'),
  createdAt: integer('created_at').notNull(),
  dispatchedAt: integer('dispatched_at'),
  completedAt: integer('completed_at'),
});
export type JobRow = typeof jobs.$inferSelect;
