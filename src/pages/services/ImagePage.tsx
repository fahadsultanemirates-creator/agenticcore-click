import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ChipToggle, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote, UploadDropzone } from "../../components/dashboard/form";

const IMAGE_TYPES = ["Avatar", "Business visual", "Product shot", "Illustration", "Other"];

export function ImagePage() {
  const [imageType, setImageType] = useState("Avatar");
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
    <DashboardShell crumb="Dashboard / Image" title="Custom art, avatars & business visuals.">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <ServicePageHeader
          eta="~5 min"
          price="from $8"
          title="What image do you need?"
          subtitle="Every request comes back with 3 options to pick from — not just one."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — we've got your <strong>{imageType.toLowerCase()}</strong> brief. This is a
            preview: nothing was actually sent or generated yet.
          </SubmittedNote>
        )}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="Image type">
            <div className="flex flex-wrap gap-2">
              {IMAGE_TYPES.map((type) => (
                <ChipToggle key={type} label={type} active={imageType === type} onClick={() => setImageType(type)} />
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
                placeholder="e.g. A friendly, professional headshot-style avatar for LinkedIn, warm tones..."
                className={`${inputClass} resize-none`}
              />
              {descError && <span className="text-xs text-yellow-400">Tell us a bit about what you need.</span>}
            </label>
          </SectionCard>

          <SectionCard title="Reference">
            <UploadDropzone label="Upload a reference photo or existing image (optional)" />
          </SectionCard>

          <SubmitBar />
        </form>
      </div>
    </DashboardShell>
  );
}
