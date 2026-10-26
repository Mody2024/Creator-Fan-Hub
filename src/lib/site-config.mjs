const SECTION_KEYS = new Set([
  "hero", "ideas", "poll", "latest", "events", "community", "videos", "socials"
]);
const THEMES = new Set(["obsidian", "paper", "violet", "custom"]);
const COLOR_MODES = new Set(["dark", "light", "system"]);
const MOTION_MODES = new Set(["full", "reduced", "off"]);
const FEATURE_KEYS = new Set([
  "polls", "ideas", "events", "guidedTour", "mascot", "voice", "miniGames", "store"
]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXT = 3000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function checkAllowedKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addError(errors, `${path}.${key}`, "unsupported property");
  }
}

function checkOptionalId(value, path, errors) {
  if (value !== null && (typeof value !== "string" || value.trim().length === 0 || value.length > 100)) {
    addError(errors, path, "must be null or a non-empty ID of at most 100 characters");
  }
}

function checkText(value, path, errors, { required = false, max = MAX_TEXT } = {}) {
  if (typeof value !== "string") {
    addError(errors, path, "must be a string");
    return;
  }
  if (required && value.trim().length === 0) addError(errors, path, "cannot be empty");
  if (value.length > max) addError(errors, path, `must be at most ${max} characters`);
}

export function validateSiteConfig(input) {
  const errors = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: "$", message: "must be an object" }] };
  }

  checkAllowedKeys(input, new Set([
    "schemaVersion", "identity", "appearance", "layout", "hero",
    "socialLinkIds", "featureFlags", "maintenance"
  ]), "$", errors);

  if (input.schemaVersion !== 1) {
    addError(errors, "schemaVersion", "unsupported schema version");
  }

  const identity = input.identity;
  if (!isRecord(identity)) {
    addError(errors, "identity", "must be an object");
  } else {
    checkAllowedKeys(identity, new Set(["siteName", "tagline", "logoMediaId", "mascotMediaId"]), "identity", errors);
    checkText(identity.siteName, "identity.siteName", errors, { required: true, max: 100 });
    checkText(identity.tagline, "identity.tagline", errors, { max: 240 });
    for (const key of ["logoMediaId", "mascotMediaId"]) {
      checkOptionalId(identity[key], `identity.${key}`, errors);
    }
  }

  const appearance = input.appearance;
  if (!isRecord(appearance)) {
    addError(errors, "appearance", "must be an object");
  } else {
    checkAllowedKeys(appearance, new Set(["theme", "accent", "colorMode", "motion"]), "appearance", errors);
    if (!THEMES.has(appearance.theme)) addError(errors, "appearance.theme", "unsupported theme");
    if (!COLOR_MODES.has(appearance.colorMode)) addError(errors, "appearance.colorMode", "unsupported color mode");
    if (!MOTION_MODES.has(appearance.motion)) addError(errors, "appearance.motion", "unsupported motion mode");
    if (typeof appearance.accent !== "string" || !HEX_COLOR.test(appearance.accent)) {
      addError(errors, "appearance.accent", "must be a six-digit hexadecimal color");
    }
  }

  const layout = input.layout;
  if (!isRecord(layout)) {
    addError(errors, "layout", "must be an object");
  } else {
    checkAllowedKeys(layout, new Set(["sectionOrder", "visibleSections"]), "layout", errors);
    for (const key of ["sectionOrder", "visibleSections"]) {
      const list = layout[key];
      if (!Array.isArray(list) || list.some((item) => typeof item !== "string")) {
        addError(errors, `layout.${key}`, "must be an array of section keys");
        continue;
      }
      if (new Set(list).size !== list.length) addError(errors, `layout.${key}`, "cannot contain duplicates");
      for (const item of list) {
        if (!SECTION_KEYS.has(item)) addError(errors, `layout.${key}`, `unsupported section: ${item}`);
      }
    }
    if (Array.isArray(layout.sectionOrder) && Array.isArray(layout.visibleSections)) {
      for (const item of layout.visibleSections) {
        if (!layout.sectionOrder.includes(item)) {
          addError(errors, "layout.visibleSections", `visible section is missing from sectionOrder: ${item}`);
        }
      }
    }
  }

  const hero = input.hero;
  if (!isRecord(hero)) {
    addError(errors, "hero", "must be an object");
  } else {
    checkAllowedKeys(hero, new Set(["title", "body", "mediaId", "overlay", "muted", "loop"]), "hero", errors);
    checkText(hero.title, "hero.title", errors, { required: true, max: 180 });
    checkText(hero.body, "hero.body", errors, { max: 1000 });
    checkOptionalId(hero.mediaId, "hero.mediaId", errors);
    if (typeof hero.overlay !== "number" || hero.overlay < 0 || hero.overlay > 1) {
      addError(errors, "hero.overlay", "must be a number from 0 to 1");
    }
    for (const key of ["muted", "loop"]) {
      if (typeof hero[key] !== "boolean") addError(errors, `hero.${key}`, "must be boolean");
    }
  }

  if (!Array.isArray(input.socialLinkIds) ||
      input.socialLinkIds.some((id) => typeof id !== "string" || id.trim().length === 0 || id.length > 100)) {
    addError(errors, "socialLinkIds", "must be an array of non-empty short ID strings");
  } else if (new Set(input.socialLinkIds).size !== input.socialLinkIds.length) {
    addError(errors, "socialLinkIds", "cannot contain duplicate IDs");
  }

  if (!isRecord(input.featureFlags)) {
    addError(errors, "featureFlags", "must be an object");
  } else {
    for (const [key, value] of Object.entries(input.featureFlags)) {
      if (!FEATURE_KEYS.has(key)) addError(errors, `featureFlags.${key}`, "unsupported feature flag");
      else if (typeof value !== "boolean") addError(errors, `featureFlags.${key}`, "must be boolean");
    }
    for (const key of FEATURE_KEYS) {
      if (typeof input.featureFlags[key] !== "boolean") {
        addError(errors, `featureFlags.${key}`, "must be explicitly set");
      }
    }
  }

  if (!isRecord(input.maintenance)) {
    addError(errors, "maintenance", "must be an object");
  } else {
    checkAllowedKeys(input.maintenance, new Set(["enabled", "message"]), "maintenance", errors);
    if (typeof input.maintenance.enabled !== "boolean") {
      addError(errors, "maintenance.enabled", "must be boolean");
    }
    checkText(input.maintenance.message, "maintenance.message", errors, { max: 240 });
  }

  return errors.length === 0
    ? { ok: true, errors: [], value: input }
    : { ok: false, errors };
}
