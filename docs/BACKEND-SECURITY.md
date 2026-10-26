# Backend and Creator Panel security plan

## Data boundaries
- Public website reads only the published site configuration and explicitly published content.
- Creator edits a draft. Publishing creates a new version and updates the public configuration only after server validation.
- Admin operations require a server-verified session and authorization check on every request. A hidden route is not security.
- Never use user-editable auth metadata for privilege decisions. Keep the administrator allowlist or role in a trusted server-managed location.
- Never expose a Supabase secret/service key in client-side JavaScript or any `NEXT_PUBLIC_*` variable.

## Community write paths
- Votes and ideas are submitted through server-side handlers or Edge Functions, not unrestricted direct table inserts.
- Validate payload shape and length, ensure the poll is open and the option belongs to it, enforce server-side rate limits, and return generic errors that don't leak private records.
- Use a stable, server-validated anonymous voter token where appropriate. Browser storage alone cannot guarantee one vote per human; state this limitation clearly.
- Never return voter-token hashes, private idea submissions, moderation notes, or audit logs to public clients.
- Moderate submitted text before featuring it; render user text as text, never as trusted HTML.

## Media safety
- Accept only supported media types and enforce file-size limits.
- Store uploads in private or policy-controlled buckets; verify ownership and publishing state on every request.
- Do not execute uploaded files or accept arbitrary HTML/JavaScript as theme code.
- Validate external URLs and use safe embed providers; never place user-provided URLs into script contexts.

## Publishing and recovery
- Keep draft and published configuration separate and version every publish.
- Log security-relevant admin changes without storing passwords, tokens, or secrets in audit details.
- Provide a backup/export and a recovery path before production launch.
- Missing credentials must disable protected operations rather than silently falling back to insecure access.

## Environment configuration
See `.env.example` for variable names only. Configure real values in local ignored environment files or Vercel's protected environment settings. Do not commit secrets.
