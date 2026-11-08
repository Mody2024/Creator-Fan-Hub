"use client";

type Metric = { title: string; views: number; reactions: number; comments: number; publishedAt: string | null };

function safeCell(value: string | number) {
  let text = String(value ?? "");
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function interactionRate(item: Pick<Metric, "views" | "reactions" | "comments">) {
  return item.views > 0 ? Number((((item.reactions + item.comments) / item.views) * 100).toFixed(2)) : 0;
}

export default function AnalyticsExport({ metrics, locale="en" }: { metrics: Metric[]; locale?: "en"|"ar" }) {
  function download() {
    const isArabic = locale === "ar";
    const header = isArabic
      ? ["نوع الصف", "الترتيب", "الفيديو", "تاريخ النشر", "المشاهدات", "التفاعلات", "التعليقات المعتمدة", "التفاعلات لكل 100 مشاهدة"]
      : ["Row type", "Views rank", "Video", "Published", "Views", "Reactions", "Approved comments", "Interactions per 100 views"];
    const totals = metrics.reduce((sum, item) => ({
      views: sum.views + Number(item.views || 0),
      reactions: sum.reactions + Number(item.reactions || 0),
      comments: sum.comments + Number(item.comments || 0)
    }), { views: 0, reactions: 0, comments: 0 });
    const summary = [
      isArabic ? "الإجمالي" : "TOTAL",
      "",
      isArabic ? "كل الفيديوهات" : "All videos",
      "",
      totals.views,
      totals.reactions,
      totals.comments,
      interactionRate(totals)
    ];
    const ranked = [...metrics].sort((a, b) => Number(b.views) - Number(a.views));
    const rows = ranked.map((item, index) => [
      isArabic ? "فيديو" : "VIDEO",
      index + 1,
      item.title,
      item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : (isArabic ? "مسودة" : "Draft"),
      item.views,
      item.reactions,
      item.comments,
      interactionRate(item)
    ]);
    const csv = "\uFEFF" + [header, summary, ...rows].map(row => row.map(safeCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isArabic ? "raye2-video-analytics-ar.csv" : "raye2-video-analytics.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <button className="editor-reload" type="button" onClick={download} disabled={!metrics.length}>{locale==="ar"?"تصدير CSV ↓":"Export CSV ↓"}</button>;
}
