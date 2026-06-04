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

export const lead = sqliteTable('lead', {
  id: text('id').primaryKey(),
  profileUrl: text('profile_url').notNull(),
  fullName: text('full_name').notNull(),
  headline: text('headline'),
  location: text('location'),
  about: text('about'),
  currentCompany: text('current_company'),
  currentTitle: text('current_title'),
  profileRaw: text('profile_raw', { mode: 'json' }).$type<Record<string, unknown>>(),
  status: text('status').notNull().default('new'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
export type LeadRow = typeof lead.$inferSelect;

export const leadExperience = sqliteTable('lead_experience', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  title: text('title'), company: text('company'), employmentType: text('employment_type'),
  startDate: text('start_date'), endDate: text('end_date'), isCurrent: integer('is_current'),
  location: text('location'), companyUrl: text('company_url'), description: text('description'),
});
export const leadEducation = sqliteTable('lead_education', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  school: text('school'), degree: text('degree'), field: text('field'),
  startYear: integer('start_year'), endYear: integer('end_year'),
});
export const leadSkill = sqliteTable('lead_skill', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});
export const leadCertification = sqliteTable('lead_certification', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), issuer: text('issuer'), issuedDate: text('issued_date'),
});
