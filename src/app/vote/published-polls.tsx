import { createSupabaseServerClient } from "@/lib/supabase/server";
import PollVoteForm from "./poll-vote-form";

type Row = { poll_id: string; poll_title: string; poll_description: string; poll_status: "open" | "closed"; poll_ends_at: string | null; option_id: string; option_label: string; option_position: number; vote_count: number };

export default async function PublishedPolls({locale="en"}:{locale?:"en"|"ar"}) {
  const isArabic=locale==="ar";
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <p className="poll-empty">{isArabic?"التصويت غير متاح في هذه المعاينة حتى يتم إعداد قاعدة البيانات.":"Polls are unavailable in this preview until the database connection is configured."}</p>;
  await supabase.rpc("raye2_open_due_polls");
  const { data, error } = await supabase.rpc("get_public_poll_results");
  if (error || !Array.isArray(data) || data.length === 0) {
    return <div className="vote-placeholder"><span className="vote-number">?</span><div><span className="eyebrow">{isArabic?"تصويت المجتمع القادم":"NEXT COMMUNITY POLL"}</span><h3>{isArabic?"يتم تجهيز التصويت القادم.":"The next vote is being prepared."}</h3><p>{isArabic?"ستظهر استطلاعات الرأي المنشورة هنا عندما يفتح المبدع تصويتًا جديدًا.":"Published polls will appear here when the creator opens one."}</p></div><span className="status-pill">{isArabic?"لا توجد استطلاعات منشورة":"NO PUBLISHED POLLS"}</span></div>;
  }
  const rows = data as Row[];
  const ids = [...new Set(rows.map(row => row.poll_id))];
  return <div className="published-polls" dir={isArabic?"rtl":"ltr"} lang={locale}>{ids.map(id => {
    const options = rows.filter(row => row.poll_id === id).sort((a,b) => a.option_position - b.option_position);
    const poll = options[0];
    const total = options.reduce((sum, option) => sum + Number(option.vote_count || 0), 0);
    return <article className="published-poll" key={id}>
      <div className="poll-meta"><span className="eyebrow">{poll.poll_status === "open" ? (isArabic?"تصويت المجتمع / مفتوح":"COMMUNITY POLL / OPEN") : (isArabic?"تصويت المجتمع / مغلق":"COMMUNITY POLL / CLOSED")}</span><span className="status-pill">{poll.poll_status === "open" ? (isArabic?"التصويت مفتوح":"VOTING OPEN") : (isArabic?"النتائج النهائية":"FINAL RESULTS")}</span></div>
      <h3>{poll.poll_title}</h3>{poll.poll_description && <p className="poll-description">{poll.poll_description}</p>}
      {poll.poll_status === "open" ? <PollVoteForm pollId={id} options={options} locale={locale} /> : <div className="poll-results">{options.map(option => {
        const count = Number(option.vote_count || 0);
        const percent = total ? Math.round(count / total * 100) : 0;
        return <div className="poll-result" key={option.option_id}><div><span>{option.option_label}</span><span>{percent}% · {count}</span></div><span className="poll-track"><i style={{ width: percent + "%" }} /></span></div>;
      })}</div>}
      <p className="poll-total">{poll.poll_status === "open" ? (isArabic?"تظل أعداد الأصوات مخفية حتى إغلاق التصويت.":"Vote counts stay hidden until this poll closes.") : `${total} ${isArabic?"صوتًا مسجلًا · انتهى هذا التصويت.":"recorded votes · This poll is closed."}`}</p>
    </article>;
  })}</div>;
}
