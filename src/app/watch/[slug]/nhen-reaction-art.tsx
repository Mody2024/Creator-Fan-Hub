"use client";

type Reaction = "spark" | "orbit" | "legend" | "laugh" | "mindblown" | "support";
const palette: Record<Reaction, { fill: string; accent: string }> = {
  spark: { fill: "#ffd76a", accent: "#9a5b13" },
  orbit: { fill: "#73d8ce", accent: "#155f70" },
  legend: { fill: "#c5a0ff", accent: "#6540a2" },
  laugh: { fill: "#ffad75", accent: "#9b472d" },
  mindblown: { fill: "#8bc8ff", accent: "#315f9a" },
  support: { fill: "#ff9fbd", accent: "#a83e68" },
};

export default function NhenReactionArt({ reaction, size = 24 }: { reaction: string; size?: number }) {
  const key = (reaction in palette ? reaction : "spark") as Reaction;
  const colors = palette[key];
  return <svg className="nhen-reaction-art" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle cx="24" cy="24" r="21" fill={colors.fill} opacity=".2"/>
    {key === "spark" && <><path d="M24 5 29 18 43 23 29 28 24 43 19 28 5 23 19 18Z" fill={colors.fill} stroke={colors.accent} strokeWidth="2" strokeLinejoin="round"/><path d="m34 7 1.5 4.5L40 13l-4.5 1.5L34 19l-1.5-4.5L28 13l4.5-1.5Z" fill="#fff4c5"/></>}
    {key === "orbit" && <><circle cx="24" cy="24" r="11" fill={colors.fill} stroke={colors.accent} strokeWidth="2"/><ellipse cx="24" cy="24" rx="21" ry="8" transform="rotate(-28 24 24)" fill="none" stroke={colors.accent} strokeWidth="3"/><circle cx="39" cy="13" r="4" fill="#fff"/></>}
    {key === "legend" && <><path d="M8 15 17 22 24 9 31 22 40 15 37 36H11Z" fill={colors.fill} stroke={colors.accent} strokeWidth="2" strokeLinejoin="round"/><path d="M12 40h24" stroke={colors.accent} strokeWidth="3" strokeLinecap="round"/><circle cx="8" cy="13" r="3" fill="#fff"/><circle cx="24" cy="7" r="3" fill="#fff"/><circle cx="40" cy="13" r="3" fill="#fff"/></>}
    {key === "laugh" && <><circle cx="24" cy="24" r="17" fill={colors.fill} stroke={colors.accent} strokeWidth="2"/><path d="M16 20h.5M31.5 20h.5" stroke={colors.accent} strokeWidth="4" strokeLinecap="round"/><path d="M14 27q10 15 20 0" fill="none" stroke={colors.accent} strokeWidth="3" strokeLinecap="round"/><path d="M18 31q6 5 12 0" fill="none" stroke="#fff" strokeWidth="2"/></>}
    {key === "mindblown" && <><path d="M24 4 28 15 40 10 34 22 45 28 32 30 34 43 24 34 14 43 16 30 3 28 14 22 8 10 20 15Z" fill={colors.fill} stroke={colors.accent} strokeWidth="2" strokeLinejoin="round"/><circle cx="24" cy="24" r="5" fill="#fff"/></>}
    {key === "support" && <><path d="M24 40S6 29 8 17c2-10 14-11 16-2 3-9 15-8 17 2 2 12-17 23-17 23Z" fill={colors.fill} stroke={colors.accent} strokeWidth="2" strokeLinejoin="round"/><path d="m16 23 5 5 11-12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
  </svg>;
}
