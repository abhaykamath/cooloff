import { z } from 'zod';
import { DECISIONS, ITEM_STATUSES } from './constants';

const currency = z
  .string()
  .trim()
  .length(3, 'Use a 3-letter currency code, e.g. INR')
  .transform((s) => s.toUpperCase());

const price = z.coerce.number().nonnegative().max(9_999_999_999.99);

const reason = z.string().trim().max(500);

export const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createItemSchema = z.object({
  url: z.url({ protocol: /^https?$/, message: 'Enter a valid http(s) link' }),
  price: price.optional(),
  currency: currency.optional(),
  reason: reason.optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    price: price.nullable(),
    currency: currency.nullable(),
    reason: reason.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const decisionSchema = z.object({
  decision: z.enum(DECISIONS),
  brokeCooldown: z.boolean().optional(),
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const listItemsQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()) : undefined))
    .pipe(z.array(z.enum(ITEM_STATUSES)).optional()),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
