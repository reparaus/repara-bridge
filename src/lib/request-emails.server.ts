/**
 * Fire-and-forget trigger for the `send-service-request-emails` edge function.
 *
 * Called only after a service request has been committed. Email delivery is
 * never allowed to affect the saved request: every failure is logged on the
 * server and swallowed, so the customer always sees the normal confirmation.
 *
 * The only value crossing the wire is the saved request id — the edge function
 * reads all email content back from the database itself.
 */
export async function triggerRequestEmails(requestId: string): Promise<void> {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key =
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[emails] missing Supabase env; skipped emails for request", requestId);
    return;
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/send-service-request-emails`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ requestId }),
    });
    if (!res.ok) {
      console.error(
        `[emails] edge function ${res.status} for request ${requestId}: ${(await res.text()).slice(0, 300)}`,
      );
    }
  } catch (error) {
    console.error(`[emails] edge function unreachable for request ${requestId}:`, error);
  }
}
