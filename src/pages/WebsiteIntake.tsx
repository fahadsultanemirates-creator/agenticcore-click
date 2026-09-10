import { CheckCircle2, Sparkles, Upload } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { services, type Service } from "../data/services";

const websiteService = services.find((s) => s.id === "website") as Service;

const PAGE_SECTIONS = [
  "About",
  "Services",
  "Gallery",
  "Testimonials",
  "Pricing",
  "Contact form",
  "Booking",
  "FAQ",
];

function Field({ label, optional = true, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {label} {optional && <span className="text-fg-faint normal-case">(optional)</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-xl border-2 border-border bg-void px-3.5 py-2.5 text-fg placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none";

export function WebsiteIntake() {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [logoChoice, setLogoChoice] = useState<"upload" | "generate">("generate");
  const [sections, setSections] = useState<string[]>(["About", "Services", "Contact form"]);
  const [nameError, setNameError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleSection = (section: string) => {
    setSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    );
  };

  const handleSelect = (service: Service) => {
    if (service.id === "website") return;
    navigate("/dashboard", { state: { serviceId: service.id } });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setSubmitted(true);
  };

  return (
    <DashboardShell activeId="website" onSelectService={handleSelect} topBarService={websiteService}>
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-400">
          <Sparkles className="h-4 w-4" />
          {websiteService.eta} &middot; {websiteService.price}
        </div>
        <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">
          Let's build your website
        </h1>
        <p className="mt-2 text-fg-muted">
          Only your business name is required — skip anything else and we'll fill in
          sensible defaults.
        </p>

        {submitted && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
            <p className="text-sm text-fg">
              Thanks — we've got your brief for <strong>{businessName}</strong>. This is a
              preview: nothing was actually sent or generated yet.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-fg">The basics</h2>
            <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Business / company name <span className="text-yellow-400">*</span>
                </span>
                <input
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    if (e.target.value.trim()) setNameError(false);
                  }}
                  placeholder="e.g. Pixel & Pine Studio"
                  className={inputClass}
                />
                {nameError && (
                  <span className="text-xs text-yellow-400">
                    We need a name to get started — everything else can wait.
                  </span>
                )}
              </label>

              <Field label="One-line description">
                <input placeholder="e.g. Handmade furniture, built to last" className={inputClass} />
              </Field>

              <Field label="Category">
                <select className={inputClass}>
                  <option value="">Choose a category...</option>
                  <option>Retail / e-commerce</option>
                  <option>Restaurant / food</option>
                  <option>Consulting / professional services</option>
                  <option>Health & wellness</option>
                  <option>Creative / portfolio</option>
                  <option>Nonprofit / community</option>
                  <option>Other</option>
                </select>
              </Field>

              <Field label="Colors / style vibe" >
                <input placeholder="e.g. Warm, earthy, handmade-feeling" className={inputClass} />
              </Field>

              <Field label="Style-reference URL">
                <input placeholder="A site whose look you like" className={inputClass} />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-fg">Logo</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setLogoChoice("generate")}
                className={`flex-1 rounded-xl border-2 p-4 text-left transition-colors ${
                  logoChoice === "generate" ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                }`}
              >
                <p className="font-semibold text-fg">Generate one for me</p>
                <p className="mt-1 text-sm text-fg-muted">We'll design a logo as part of the build.</p>
              </button>
              <button
                type="button"
                onClick={() => setLogoChoice("upload")}
                className={`flex-1 rounded-xl border-2 p-4 text-left transition-colors ${
                  logoChoice === "upload" ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                }`}
              >
                <p className="font-semibold text-fg">I already have one</p>
                <p className="mt-1 text-sm text-fg-muted">Upload your existing logo file.</p>
              </button>
            </div>
            {logoChoice === "upload" && (
              <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-void px-4 py-6 text-sm text-fg-faint transition-colors hover:border-yellow-400/50">
                <Upload className="h-4 w-4" />
                Click to choose a file (not uploaded anywhere yet)
                <input type="file" className="hidden" />
              </label>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-fg">Content</h2>
            <div className="mt-4 flex flex-col gap-4">
              <Field label="Services offered">
                <textarea
                  rows={3}
                  placeholder="List what you offer, one per line or comma-separated"
                  className={`${inputClass} resize-none`}
                />
              </Field>

              <div>
                <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Desired page sections
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PAGE_SECTIONS.map((section) => {
                    const active = sections.includes(section);
                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => toggleSection(section)}
                        className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? "border-yellow-400 bg-yellow-400 text-void"
                            : "border-border text-fg-muted hover:border-yellow-400/50"
                        }`}
                      >
                        {section}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Anything else we should know">
                <textarea
                  rows={3}
                  placeholder="Anything that doesn't fit above"
                  className={`${inputClass} resize-none`}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-fg">Contact & socials</h2>
            <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label="Contact details">
                <input placeholder="Phone, address, hours..." className={inputClass} />
              </Field>
              <Field label="Business email">
                <input type="email" placeholder="you@business.com" className={inputClass} />
              </Field>
              <Field label="Instagram">
                <input placeholder="@yourbusiness" className={inputClass} />
              </Field>
              <Field label="Facebook / other social">
                <input placeholder="Link or handle" className={inputClass} />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-void p-6">
            <h2 className="font-display text-base font-semibold text-fg">A few things worth knowing</h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm text-fg-muted">
              <li>
                <strong className="text-fg">Connecting your domain</strong> is simple — usually a
                nameserver switch, or adding a couple of records if you'd like to keep things like
                email on that domain. We'll guide you through it.
              </li>
              <li>
                <strong className="text-fg">Revisions:</strong> 2 free revisions are included, and
                they cover things like text, address, and color changes — not logo or image
                changes.
              </li>
              <li>
                Need something longer-scope or heavier than a starter site? That's a better fit for{" "}
                <strong className="text-fg">AgenticCore.agency</strong>, our full-service sibling.
              </li>
            </ul>
          </div>

          <button
            type="submit"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5"
          >
            Send brief
            <Sparkles className="h-4 w-4" />
          </button>
          <p className="-mt-4 text-xs text-fg-faint">
            Mockup only — this simulates the flow, no request is actually sent anywhere.
          </p>
        </form>
      </div>
    </DashboardShell>
  );
}
