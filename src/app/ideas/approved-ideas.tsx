import { createSupabaseServerClient } from "@/lib/supabase/server";
type IdeaRow = { idea_id: string; display_name: string; idea_title: string; idea_body: string; submitted_at: string };
export default async function ApprovedIdeas() {
  const supabase=await createSupabaseServerClient();
  if(!supabase) return null;
  const {data,error}=await supabase.rpc("get_public_approved_ideas");
  if(error||!Array.isArray(data)||data.length===0) return null;
  const ideas=data as IdeaRow[];
  return <section className="approved-ideas" aria-labelledby="approved-ideas-title">
    <div className="approved-ideas-heading"><span className="eyebrow">COMMUNITY / APPROVED & FEATURED</span><h3 id="approved-ideas-title">On the <em>idea board.</em></h3><p>Creator-approved and featured submissions appear here.</p></div>
    <div className="approved-ideas-grid">{ideas.map(idea=><article className="approved-idea" key={idea.idea_id}><span className="eyebrow">{new Date(idea.submitted_at).toLocaleDateString()}</span><h4>{idea.idea_title}</h4><p>{idea.idea_body}</p><span className="approved-idea-author">SUGGESTED BY {idea.display_name||"ANONYMOUS"}</span></article>)}</div>
  </section>;
}
