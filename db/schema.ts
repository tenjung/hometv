import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const channels = sqliteTable('channels', {id:text('id').primaryKey(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),updatedAt:integer('updated_at').notNull()});
export const settings = sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const reports = sqliteTable('reports',{id:text('id').primaryKey(),channelId:text('channel_id').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull()});
export const attempts = sqliteTable('attempts',{id:text('id').primaryKey(),failures:integer('failures').notNull().default(0),windowAt:integer('window_at').notNull()});
