<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Notifications: in-app rows are created in SQL (triggers/definer fns); email/SMS delivery goes through the send-service-request-emails edge function `notify` mode and is logged in notification_deliveries. Why: one delivery path, never blocks the saved action.
- Guest access uses request_access_tokens (hash only, service-role only) resolved in server fns; never accept a request id from guests. Why: request-scoped, non-enumerable.
- SMS goes through Twilio inside the send-service-request-emails edge function (notify mode + confirmation), gated by channel choice, E.164 number and explicit sms_consent_at; each channel has its own dedupe key in notification_deliveries. Why: one delivery path, secrets never leave the edge function.
- Provider quote lines live in provider_quote_items (RLS: owning provider + admins only); customers read them only via provider_quote_customer_items() which omits cost/supplier, and the VIN is never in provider_request_brief. Why: provider cost and VIN stay private while totals/versioning reuse submit_provider_quote.
- Labor times are source-tagged rows (labor_time_estimates / provider_labor_defaults, 0027); the app never invents hours and shows a suggestion only when a vehicle-applicable row exists. Why: provider stays in control, future licensed data plugs in without UI changes.
