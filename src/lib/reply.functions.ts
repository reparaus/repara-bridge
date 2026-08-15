import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public customer reply endpoints. No account required: authorization is the
 * random single-purpose token from the clarification email, which expires and
 * can be revoked. Only the question itself is ever returned — never contact
 * details, quotes or other requests.
 */

const tokenSchema = z.object({ token: z.string().trim().regex(/^[0-9a-f]{16,96}$/) });

export const getReplyContextFn = createServerFn({ method: "POST" })
  .inputValidator((data) => tokenSchema.parse(data))
  .handler(async ({ data }) => {
    const { getReplyContext } = await import("@/lib/repara-ai.server");
    return getReplyContext(data.token);
  });

export const submitCustomerReplyFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema.extend({ message: z.string().trim().min(2).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { submitCustomerReply } = await import("@/lib/repara-ai.server");
    return submitCustomerReply(data.token, data.message);
  });
