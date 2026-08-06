import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.WORK_ORDER_DATABASE_URL!,
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
