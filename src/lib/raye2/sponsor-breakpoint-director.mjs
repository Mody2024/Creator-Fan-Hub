/**
 * Deterministic, provider-neutral sponsor break selector.
 * It only ranks timestamp evidence supplied by a trusted media-analysis or creator-review step.
 * It does not inspect media, infer dialogue, or insert ads by itself.
 *
 * @typedef {"chapter"|"scene_transition"|"dialogue_gap"|"creator_mark"} BreakSource
 * @typedef {{atSeconds:number,source:BreakSource,confidence:number,dialogueActive?:boolean,climax?:boolean,keyAction?:boolean,creatorExcluded?:boolean}} BreakCandidate
 * @typedef {{durationSeconds:number,candidates:BreakCandidate[],maxBreaks?:number,minSpacingSeconds?:number,minLeadSeconds?:number,minTailSeconds?:number,minConfidence?:number}} BreakDirectorInput
 * @typedef {{atSeconds:number,resumeContextFromSeconds:number,source:BreakSource,score:number}} SelectedBreak
 */

/**
 * Selects only clear, low-disruption breaks. Speech, climax, key action and creator
 * exclusions are hard stops; no score can override them.
 * @param {BreakDirectorInput} input
 * @returns {SelectedBreak[]}
 */
export function selectSponsorBreakpoints(input) {
  const duration = Number(input?.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(input?.candidates)) return [];

  const maxBreaks = Math.min(3, Math.max(0, Math.floor(input.maxBreaks ?? 2)));
  const spacing = Math.max(30, Number(input.minSpacingSeconds ?? 300));
  const lead = Math.max(0, Number(input.minLeadSeconds ?? 60));
  const tail = Math.max(0, Number(input.minTailSeconds ?? 30));
  const confidenceFloor = Math.min(1, Math.max(0, Number(input.minConfidence ?? 0.7)));
  if (maxBreaks === 0 || duration <= lead + tail) return [];

  const sourceWeight = { creator_mark: 1, dialogue_gap: 0.95, chapter: 0.9, scene_transition: 0.8 };
  const eligible = input.candidates.flatMap(candidate => {
    const at = Number(candidate?.atSeconds);
    const confidence = Number(candidate?.confidence);
    if (!Number.isFinite(at) || !Number.isFinite(confidence)) return [];
    if (at < lead || at > duration - tail || confidence < confidenceFloor) return [];
    if (candidate.dialogueActive || candidate.climax || candidate.keyAction || candidate.creatorExcluded) return [];
    const weight = sourceWeight[candidate.source];
    if (!weight) return [];
    return [{ atSeconds: at, source: candidate.source, score: Number((confidence * weight).toFixed(4)) }];
  }).sort((a, b) => b.score - a.score || a.atSeconds - b.atSeconds);

  const selected = [];
  for (const candidate of eligible) {
    if (selected.length >= maxBreaks) break;
    if (selected.some(item => Math.abs(item.atSeconds - candidate.atSeconds) < spacing)) continue;
    selected.push({
      ...candidate,
      // Optional short context replay starts before the break; player/provider decides if supported.
      resumeContextFromSeconds: Math.max(0, candidate.atSeconds - 5)
    });
  }
  return selected.sort((a, b) => a.atSeconds - b.atSeconds);
}
