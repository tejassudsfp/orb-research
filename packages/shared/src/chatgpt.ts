import { z } from 'zod';

/** Plan credentials never cross the sidecar boundary. These are display facts only. */
export const CHATGPT_PROVIDER = 'chatgpt-plan';
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';
export const ChatGPTProfile = z.strictObject({
  id: z.string(),
  label: z.string(),
  connected: z.boolean(),
  planEnabled: z.boolean(),
});
export const ChatGPTState = z.strictObject({
  profiles: z.array(ChatGPTProfile),
  active: z.string().optional(),
  pending: z.boolean(),
  message: z.string().optional(),
  welcome: z.boolean(),
  verifiedAt: z.number().optional(),
  models: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type ChatGPTState = z.infer<typeof ChatGPTState>;
export const ChatGPTAction = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('connect'),
    profileId: z.string().max(100).optional(),
    enablePlan: z.boolean().optional(),
  }),
  z.strictObject({ action: z.literal('cancel') }),
  z.strictObject({ action: z.literal('select'), profileId: z.string().max(100) }),
  z.strictObject({ action: z.literal('disconnect'), profileId: z.string().max(100) }),
  z.strictObject({ action: z.literal('refresh') }),
  z.strictObject({ action: z.literal('test') }),
  z.strictObject({ action: z.literal('welcomeSeen') }),
]);
export type ChatGPTAction = z.infer<typeof ChatGPTAction>;
