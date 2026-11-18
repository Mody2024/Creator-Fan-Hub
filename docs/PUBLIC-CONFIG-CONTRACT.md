# Public configuration contract

The public website must consume only the published snapshot. The Creator Panel edits a separate draft and cannot publish directly from browser code.

## Shape

Use a versioned JSON document stored in `published_site_config.published`:

```json
{
  "schemaVersion": 1,
  "identity": {
    "siteName": "Creator Community",
    "tagline": "Help shape what comes next.",
    "logoMediaId": null,
    "mascotMediaId": null
  },
  "appearance": {
    "theme": "obsidian",
    "accent": "#d6ff72",
    "colorMode": "dark",
    "motion": "full"
  },
  "layout": {
    "sectionOrder": ["hero", "ideas", "poll", "latest", "events", "community"],
    "visibleSections": ["hero", "ideas", "poll", "latest", "events", "community"]
  },
  "hero": {
    "title": "Your next favorite video starts here.",
    "body": "Vote on ideas and suggest what we create next.",
    "mediaId": null,
    "overlay": 0.4,
    "muted": true,
    "loop": true
  },
  "socialLinkIds": [],
  "featureFlags": {
    "polls": true,
    "ideas": true,
    "events": true,
    "guidedTour": true,
    "mascot": true,
    "voice": false,
    "miniGames": false,
    "store": false
  },
  "maintenance": {
    "enabled": false,
    "message": "We will be back soon."
  }
}
```

This example is a contract, not live content. Media IDs must reference authorized media records; arbitrary HTML/JS is never allowed.

## Validation rules
- Reject unknown schema versions and malformed types before saving or publishing.
- Enforce length and allowlist constraints on every string, enum, color, URL and media reference.
- Section order must contain only supported section keys; visible sections must be a subset of supported keys.
- Feature flags only control presentation and availability. They never grant authorization.
- A publish operation validates the entire draft on the server, writes a new immutable/versioned published snapshot, records an audit event, and updates the public pointer atomically.
- The public endpoint returns published data only, with no draft fields, private media paths, moderation notes, or administrator metadata.
- Keep the permanent creator credit in the shared application layout rather than in this configurable JSON, so the ordinary panel cannot remove it.
- Validate media ownership, MIME type, size, and publication status server-side. For external media, allow only supported providers or safe HTTPS links.
- Maintenance mode must have a tested creator/admin bypass that uses server authorization; do not create a public secret query parameter.

## Draft and publish workflow
1. Load the latest draft for an authorized creator session.
2. Validate and save the draft; show a preview using that draft only to the authenticated creator.
3. On publish, revalidate on the server and compare the draft version to avoid overwriting concurrent edits.
4. Create the next published version and audit record in one transaction.
5. Confirm success only after the database commits; public visitors then read the new published snapshot.
6. Keep prior published versions recoverable and provide a rollback action restricted to authorized admins.
