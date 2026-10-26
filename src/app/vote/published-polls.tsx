import { createSupabaseServerClient } from "@/lib/supabase/server";

type Row = { poll_id: string; poll_title: string; poll_description: string; poll_status: "open" | "closed"; poll_ends_at: string | null; option_id: string; option_label: string; option_position: number; vote_count: number };

export default async function PublishedPolls() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <p className="poll-empty">Polls are unavailable in this preview until the database connection is configured.</p>;
  const { data, error } = await supabase.rpc("get_public_poll_results");
  if (error || !Array.isArray(data) || data.length === 0) {
    return <div className="vote-placeholder"><span className="vote-number">?</span><div><span className="eyebrow">NEXT COMMUNITY POLL</span><h3>The next vote is being prepared.</h3><p>Published polls will appear here when the creator opens one.</p></div><span className="status-pill">NO PUBLISHED POLLS</span></div>;
  }
  const rows = data as Row[];
  const ids = [...new Set(rows.map(row => row.poll_id))];
  return <div className="published-polls">{ids.map(id => {
    const options = rows.filter(row => row.poll_id === id).sort((a,b) => a.option_position - b.option_position);
    const poll = options[0];
    const total = options.reduce((sum, option) => sum + Number(option.vote_count || 0), 0);
    return <article className="published-poll" key={id}>
      <div className="poll-meta"><span className="eyebrow">{poll.poll_status === "open" ? "COMMUNITY POLL / OPEN" : "COMMUNITY POLL / CLOSED"}</span><span className="status-pill">{poll.poll_status === "open" ? "VOTING CONTROLS IN PROGRESS" : "RESULTS"}</span></div>
      <h3>{poll.poll_title}</h3>{poll.poll_description && <p className="poll-description">{poll.poll_description}</p>}
      <div className="poll-results">{options.map(option => {
        const count = Number(option.vote_count || 0);
        const percent = total ? Math.round(count / total * 100) : 0;
        return <div className="poll-result" key={option.option_id}><div><span>{option.option_label}</span><span>{percent}% · {count}</span></div><span className="poll-track"><i style={{ width: percent + "%" }} /></span></div>;
      })}</div>
      <p className="poll-total">{total} recorded votes · {poll.poll_status === "open" ? "Voting controls will appear after abuse protection is complete." : "This poll is closed."}</p>
    </article>;
  })}</div>;
}
