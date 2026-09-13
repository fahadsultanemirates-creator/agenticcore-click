import { Check, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { ChipToggle, Field, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote } from "../components/dashboard/form";

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

const TIERS = [
  {
    id: "small",
    label: "2–4 pages",
    price: "$49",
    blurb: "A focused site — home, about, services/contact.",
  },
  {
    id: "large",
    label: "4–10 pages",
    price: "$99",
    blurb: "Room for a full sitemap — galleries, multiple services, blog.",
  },
] as const;

export function WebsiteIntake() {
  const [businessName, setBusinessName] = useState("");
  const [logoChoice, setLogoChoice] = useState<"upload" | "generate">("generate");
  const [sections, setSections] = useState<string[]>(["About", "Services", "Contact form"]);
  const [tier, setTier] = useState<(typeof TIERS)[number]["id"] | null>(null);
  const [categoryDelegate, setCategoryDelegate] = useState(false);
  const [colorsDelegate, setColorsDelegate] = useState(false);
  const [servicesDelegate, setServicesDelegate] = useState(false);
  const [sectionsDelegate, setSectionsDelegate] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [tierError, setTierError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleSection = (section: string) => {
    setSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    let ok = true;
    if (!businessName.trim()) {
      setNameError(true);
      ok = false;
    }
    if (!tier) {
      setTierError(true);
      ok = false;
    }
    if (!ok) return;
    setNameError(false);
    setTierError(false);
    setSubmitted(true);
  };

  return (
    <DashboardShell crumb="Dashboard / Website" title="A real site, live fast.">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <ServicePageHeader
          eta="~20 min"
          price="from $49"
          title="Let's build your website"
          subtitle="Only your business name and a page-count tier are required — skip anything else and tick “you decide” where it applies."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — we've got your brief for <strong>{businessName}</strong>. This is a
            preview: nothing was actually sent or generated yet.
          </SubmittedNote>
        )}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="The basics">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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

              <Field label="Category" delegate={{ checked: categoryDelegate, onChange: setCategoryDelegate }}>
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

              <Field label="Colors / style vibe" delegate={{ checked: colorsDelegate, onChange: setColorsDelegate }}>
                <input placeholder="e.g. Warm, earthy, handmade-feeling" className={inputClass} />
              </Field>

              <Field label="Style-reference URL">
                <input placeholder="A site whose look you like" className={inputClass} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Logo">
            <div className="flex flex-col gap-3 sm:flex-row">
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
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-void px-4 py-6 text-sm text-fg-faint transition-colors hover:border-yellow-400/50">
                <Upload className="h-4 w-4" />
                Click to choose a file (not uploaded anywhere yet)
                <input type="file" className="hidden" />
              </label>
            )}
          </SectionCard>

          <SectionCard title="Content">
            <Field label="Services offered" delegate={{ checked: servicesDelegate, onChange: setServicesDelegate }}>
              <textarea
                rows={3}
                placeholder="List what you offer, one per line or comma-separated"
                className={`${inputClass} resize-none`}
              />
            </Field>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  Desired page sections
                </span>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-fg-faint">
                  <input
                    type="checkbox"
                    checked={sectionsDelegate}
                    onChange={(e) => setSectionsDelegate(e.target.checked)}
                    className="accent-yellow-400"
                  />
                  You decide
                </label>
              </div>
              <div className={`mt-2 flex flex-wrap gap-2 ${sectionsDelegate ? "pointer-events-none opacity-40" : ""}`}>
                {PAGE_SECTIONS.map((section) => (
                  <ChipToggle
                    key={section}
                    label={section}
                    active={sections.includes(section)}
                    onClick={() => toggleSection(section)}
                  />
                ))}
              </div>
            </div>

            <Field label="Anything else we should know">
              <textarea
                rows={3}
                placeholder="Anything that doesn't fit above"
                className={`${inputClass} resize-none`}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Contact & socials">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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
              <Field label="Telegram">
                <input placeholder="@yourbusiness or invite link" className={inputClass} />
              </Field>
              <Field label="WhatsApp">
                <input placeholder="Number or wa.me link" className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-fg-faint">
              Whatever you fill in here becomes live contact buttons on the finished site.
            </p>
          </SectionCard>

          <SectionCard title="Choose your size">
            <div className="grid gap-3 sm:grid-cols-2">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTier(t.id);
                    setTierError(false);
                  }}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${
                    tier === t.id ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-fg">{t.label}</p>
                    {tier === t.id && <Check className="h-4 w-4 text-yellow-400" />}
                  </div>
                  <p className="mt-1 font-display text-2xl font-semibold text-fg">{t.price}</p>
                  <p className="mt-1 text-sm text-fg-muted">{t.blurb}</p>
                </button>
              ))}
            </div>
            {tierError && (
              <span className="text-xs text-yellow-400">Pick a size to see your price.</span>
            )}
            <p className="text-xs text-fg-faint">Placeholder pricing — final numbers land before launch.</p>
          </SectionCard>

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

          <SubmitBar />
        </form>
      </div>
    </DashboardShell>
  );
}
