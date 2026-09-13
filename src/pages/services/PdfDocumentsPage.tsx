import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ChipToggle, Field, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote, UploadDropzone } from "../../components/dashboard/form";

const DOC_TYPES = [
  "Presentation (PowerPoint)",
  "Brochure",
  "Business card",
  "Flyer",
  "Banner",
  "Other",
];

export function PdfDocumentsPage() {
  const [docType, setDocType] = useState("Presentation (PowerPoint)");
  const [description, setDescription] = useState("");
  const [descError, setDescError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setDescError(true);
      return;
    }
    setDescError(false);
    setSubmitted(true);
  };

  return (
    <DashboardShell crumb="Dashboard / PDF & Documents" title="Presentations, brochures, flyers & more.">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <ServicePageHeader
          eta="~15 min"
          price="from $15"
          title="What should we design?"
          subtitle="Pick a document type and describe what you need — a style-reference URL can pull your branding automatically."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — we've got your <strong>{docType.toLowerCase()}</strong> brief. This is a
            preview: nothing was actually sent or generated yet.
          </SubmittedNote>
        )}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="Document type">
            <div className="flex flex-wrap gap-2">
              {DOC_TYPES.map((type) => (
                <ChipToggle key={type} label={type} active={docType === type} onClick={() => setDocType(type)} />
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
                placeholder="e.g. A tri-fold brochure for my landscaping business — services, pricing, contact..."
                className={`${inputClass} resize-none`}
              />
              {descError && <span className="text-xs text-yellow-400">Tell us a bit about what you need.</span>}
            </label>

            <Field label="Your website URL (auto-pulls logo, colors, copy & socials)">
              <input placeholder="https://yourbusiness.com" className={inputClass} />
            </Field>
          </SectionCard>

          <SectionCard title="Assets">
            <UploadDropzone label="Upload an existing logo or images to include (optional)" />
          </SectionCard>

          <SubmitBar />
        </form>
      </div>
    </DashboardShell>
  );
}
