"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Report = {
  eligible_campaigns: number;
  impressions_served: number;
  estimated_creator_share: number | string;
  finalized_creator_share: number | string;
  adjustments: number | string;
  payout_status: string;
  disclaimer: string;
  viewer_identity_data_exposed: boolean;
};

export default function MonetizationReport({ locale }: { locale: "en" | "ar" }) {
  const isArabic = locale === "ar";
  const t = isArabic
    ? { title: "أرباح الرعاية", note: "تقديرات مقابل مبالغ نهائية وتعديلات وحالة الدفع. لا نُظهر أرقامًا مختلقة.", eligible: "حملات مؤهلة", impressions: "مرات الظهور", estimated: "تقدير المبدع", finalized: "المبلغ النهائي", adjustments: "التعديلات", payout: "حالة الدفع", notConfigured: "غير مُفعّل بعد", loading: "جارٍ التحميل…" }
    : { title: "Sponsorship earnings", note: "Estimates versus finalized amounts, adjustments and payout status. We never show fabricated figures.", eligible: "Eligible campaigns", impressions: "Impressions served", estimated: "Estimated creator share", finalized: "Finalized creator share", adjustments: "Adjustments", payout: "Payout status", notConfigured: "Not configured yet", loading: "Loading…" };

  const [report, setReport] = useState<Report | null>(null);
  const [notice, setNotice] = useState(t.loading);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setNotice("Supabase is not configured."); return; }
    try {
      const { data, error } = await supabase.rpc("raye2_creator_monetization_report");
      if (error) throw error;
      setReport(data as Report);
      setNotice(t.note);
    } catch (e) { setReport(null); setNotice(e instanceof Error ? e.message : "Could not load earnings."); }
  }, [t.note]);

  useEffect(() => { void load(); }, [load]);

  const num = (v: number | string) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(v) || 0);

  return (
    <section className="raye2-monetization-report">
      <h2>{t.title}</h2>
      <p className="nhen-muted">{notice}</p>
      {report && (
        <dl className="raye2-monetization-metrics">
          <div><dt>{t.eligible}</dt><dd>{report.eligible_campaigns}</dd></div>
          <div><dt>{t.impressions}</dt><dd>{report.impressions_served}</dd></div>
          <div><dt>{t.estimated}</dt><dd>{num(report.estimated_creator_share)}</dd></div>
          <div><dt>{t.finalized}</dt><dd>{num(report.finalized_creator_share)}</dd></div>
          <div><dt>{t.adjustments}</dt><dd>{num(report.adjustments)}</dd></div>
          <div><dt>{t.payout}</dt><dd>{report.payout_status === "not_configured" ? t.notConfigured : report.payout_status}</dd></div>
        </dl>
      )}
    </section>
  );
}
