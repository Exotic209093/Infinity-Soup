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
  connections: integer('connections'),
  followers: integer('followers'),
  openToWork: integer('open_to_work'),
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
export const leadPost = sqliteTable('lead_post', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  urn: text('urn'), text: text('text'), postedAt: text('posted_at'), url: text('url'),
  likes: integer('likes'), comments: integer('comments'), reposts: integer('reposts'),
  isRepost: integer('is_repost'),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  liProfileUrl: text('li_profile_url'),
  createdAt: integer('created_at').notNull(),
});
export type AccountRow = typeof account.$inferSelect;

export const campaign = sqliteTable('campaign', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => account.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // draft | running | paused | done
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
export type CampaignRow = typeof campaign.$inferSelect;

export const node = sqliteTable('node', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // visit|connect|message|follow|endorse|wait|condition|end
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  x: integer('x').notNull().default(0),
  y: integer('y').notNull().default(0),
});
export type NodeRow = typeof node.$inferSelect;

export const edge = sqliteTable('edge', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  fromNodeId: text('from_node_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  toNodeId: text('to_node_id').notNull().references(() => node.id, { onDelete: 'cascade' }),
  condition: text('condition').notNull().default('default'), // default|accepted|replied|timeout
});
export type EdgeRow = typeof edge.$inferSelect;

export const enrollment = sqliteTable('enrollment', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaign.id, { onDelete: 'cascade' }),
  leadId: text('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
  currentNodeId: text('current_node_id'),
  state: text('state').notNull().default('active'), // active|dispatched|paused|done|failed
  connectionState: text('connection_state').notNull().default('none'), // none|pending|connected
  nextRunAt: integer('next_run_at'),
  pendingJobId: text('pending_job_id'),
  attempts: integer('attempts').notNull().default(0),
  repliedAt: integer('replied_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});
export type EnrollmentRow = typeof enrollment.$inferSelect;

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export type SettingRow = typeof setting.$inferSelect;
