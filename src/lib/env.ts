import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  APP_URL: z.string().url('APP_URL must be a valid URL'),
  NODE_OPTIONS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = envSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  APP_URL: process.env.APP_URL,
  NODE_OPTIONS: process.env.NODE_OPTIONS,
  LOG_LEVEL: process.env.LOG_LEVEL,
});

export type Env = z.infer<typeof envSchema>;
