export type BreakSource = "chapter" | "scene_transition" | "dialogue_gap" | "creator_mark";
export type BreakCandidate = {
  atSeconds: number;
  source: BreakSource;
  confidence: number;
  dialogueActive?: boolean;
  climax?: boolean;
  keyAction?: boolean;
  creatorExcluded?: boolean;
};
export type BreakDirectorInput = {
  durationSeconds: number;
  candidates: BreakCandidate[];
  maxBreaks?: number;
  minSpacingSeconds?: number;
  minLeadSeconds?: number;
  minTailSeconds?: number;
  minConfidence?: number;
};
export type SelectedBreak = {
  atSeconds: number;
  resumeContextFromSeconds: number;
  source: BreakSource;
  score: number;
};
export function selectSponsorBreakpoints(input: BreakDirectorInput): SelectedBreak[];
