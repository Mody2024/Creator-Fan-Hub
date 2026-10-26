# Free-tier-only operating policy

This repository must not require a paid API, paid marketplace integration, paid build service, or paid plan upgrade.

## Rules
- Use the existing free tiers of GitHub, Vercel, and Supabase where available.
- Do not enable billing upgrades or create paid resources.
- Do not add paid AI APIs, paid image/video/audio generation APIs, commercial asset dependencies, or metered third-party services.
- Prefer local code, browser-native capabilities, open-source packages, and creator-supplied media.
- Pin dependencies and commit lockfiles; review dependency licenses and avoid unnecessary packages.
- Keep uploads within the free storage quota and enforce file size/type limits.
- Keep database queries efficient; use pagination and indexes, and avoid unnecessary polling.
- If a free-tier limit blocks a task, pause that task and use a free workaround or wait for the limit to reset. Never bypass a limit by upgrading.
- Provider terms, quotas, and free plans can change. Recheck before adding any service and do not promise unlimited free usage.

## Current known constraints
- Vercel development builds have hit a free build-rate limit. Do not upgrade to Pro to resolve it.
- Supabase project creation was quoted at $0/month; this is not a guarantee of unlimited future usage.
- Creator authentication must be provisioned explicitly; public registration is disabled.
- Public poll results are aggregate-only. Do not expose voter hashes or raw vote rows.
- Do not release to production until build, security, accessibility, and end-to-end checks are successful.
