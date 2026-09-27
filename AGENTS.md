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
