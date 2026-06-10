import { z } from 'zod';

export const realtimeQuerySchema = z.object({
  externalIds: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (typeof val === 'string' ? val.split(',') : val))
    .pipe(z.array(z.string().min(1)).min(1)),
  idProveedor: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
});

export type RealtimeQuery = z.infer<typeof realtimeQuerySchema>;
