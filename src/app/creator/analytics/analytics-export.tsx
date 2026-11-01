"use client";

type Metric = { title: string; views: number; reactions: number; comments: number; publishedAt: string | null };

function safeCell(value: string | number) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export default function AnalyticsExport({ metrics, locale="en" }: { metrics: Metric[]; locale?: "en"|"ar" }) {
  function download() {
    const header = locale==="ar" ? ["الفيديو", "تاريخ النشر", "المشاهدات", "التفاعلات", "التعليقات المعتمدة"] : ["Video", "Published", "Views", "Reactions", "Approved comments"];
    const rows = metrics.map(item => [
      item.title,
      item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : (locale==="ar" ? "مسودة" : "Draft"),
      item.views,
      item.reactions,
      item.comments
    ]);
    const csv = "\uFEFF" + [header, ...rows].map(row => row.map(safeCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = locale==="ar" ? "nhen-video-analytics-ar.csv" : "nhen-video-analytics.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <button className="editor-reload" type="button" onClick={download} disabled={!metrics.length}>{locale==="ar"?"تصدير CSV ↓":"Export CSV ↓"}</button>;
}
