// Owner-configured copy (hero title, tagline, ...) is stored in a single language. Use it only when its script
// matches the page language; otherwise fall back to the built-in translation so visitors never see a mix.
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F]/g;
const ANY_LETTER = /[\p{L}]/gu;

export function copyLanguage(text: string): "ar" | "en" | "none" {
  const letters = text.match(ANY_LETTER)?.length ?? 0;
  if (!letters) return "none";
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  return arabic / letters > 0.4 ? "ar" : "en";
}

export function localizedCopy(value: string | null | undefined, fallback: string, locale: "en" | "ar"): string {
  const text = (value ?? "").trim();
  if (!text) return fallback;
  const language = copyLanguage(text);
  return language === "none" || language === locale ? text : fallback;
}
