import { Link } from "react-router-dom";
const TEAM = [
 ["Forge", "Brand leader"], ["Maya", "Your first contact"], ["Atlas", "Technology"],
 ["Nova", "Creative & design"], ["Leo", "Marketing"], ["Iris", "Operations"],
 ["Ledger", "Finance preparation"], ["Sage", "Research"], ["Orion", "Quality review"], ["Amara", "Office setup"],
];
export function TeamSection() {
 return <section id="team" className="mx-auto max-w-6xl px-6 py-16">
  <h2 className="font-display text-3xl font-semibold text-fg">One team across AgenticCore.</h2>
  <p className="mt-4 max-w-2xl text-fg-muted">Start with Maya for service questions and your project brief. Meet the specialists behind the wider office offer. Forge leads the brand; direct Forge chat is available to clients with an active Group package.</p>
  <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">{TEAM.map(([name, role], i) => <article key={name} className="rounded-2xl border border-border bg-surface p-3">
   <div role="img" aria-label={name + ", illustrated AI character"} style={{height:160,backgroundImage:"url(https://agenticcore.group/assets/team.png)",backgroundSize:"500% auto",backgroundPosition:`${(i%5)*25}% ${i<5?23:91}%`,backgroundRepeat:"no-repeat",borderRadius:12}} />
   <h3 className="mt-3 font-semibold text-fg">{name}</h3><p className="text-xs text-fg-muted">{role}</p>
  </article>)}</div>
  <div className="mt-6 flex flex-wrap gap-4"><Link to="/dashboard/maya" className="rounded-full border border-border px-5 py-3 font-semibold text-fg">Talk to Maya ↗</Link><a href="https://agenticcore.group/services.html" className="rounded-full border border-border px-5 py-3 font-semibold text-fg">Explore your digital office ↗</a></div>
  <p className="mt-4 text-xs text-fg-faint">AI characters represent the team’s roles. The shared execution framework is planned; a conversation does not activate services or authorise payment.</p>
 </section>;
}
