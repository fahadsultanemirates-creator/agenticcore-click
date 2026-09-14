import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ChipToggle, ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote } from "../../components/dashboard/form";
import { submitTask } from "../../lib/submitTask";

const KIT_ITEMS = [
  "Business name + tagline generator",
  "Brand style guide one-pager",
  "Letterhead design",
  "Email signature design",
  "Price list / menu design",
  "QR-code business card",
  "QR-code table tent",
  "\"Coming soon\" teaser page",
];

export function BrandKitPage() {
  const [item, setItem] = useState(KIT_ITEMS[0]);
  const [description, setDescription] = useState("");
  const [descError, setDescError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [publicId, setPublicId] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setDescError(true);
      return;
    }
    setDescError(false);
    setSubmitError("");
    setSubmitting(true);
    const result = await submitTask("brand-kit", { item, description: description.trim() });
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setPublicId(result.publicId);
    setSubmitted(true);
  };

  return (
    <DashboardShell crumb="Dashboard / Brand & Marketing Kit" title="Identity, price lists, QR cards.">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <ServicePageHeader
          eta="~10 min"
          price="from $10"
          title="What are we building for your brand?"
          subtitle="Everything about how your business presents itself — beyond the logo."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — task <strong>{publicId}</strong> is queued for your{" "}
            <strong>{item.toLowerCase()}</strong>. We'll notify you once it's ready.
          </SubmittedNote>
        )}
        {submitError && <ErrorNote>{submitError}</ErrorNote>}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="Pick an item">
            <div className="flex flex-wrap gap-2">
              {KIT_ITEMS.map((kitItem) => (
                <ChipToggle key={kitItem} label={kitItem} active={item === kitItem} onClick={() => setItem(kitItem)} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="The brief">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                Describe what you want <span className="text-yellow-400">*</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (e.target.value.trim()) setDescError(false);
                }}
                rows={4}
                placeholder="e.g. A QR-code table tent for my restaurant, matching our existing brand colors..."
                className={`${inputClass} resize-none`}
              />
              {descError && <span className="text-xs text-yellow-400">Tell us a bit about what you need.</span>}
            </label>
          </SectionCard>

          <SubmitBar loading={submitting} />
        </form>
      </div>
    </DashboardShell>
  );
}
