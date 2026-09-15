import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ChipToggle, ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote, BrandUrlField, UploadDropzone } from "../../components/dashboard/form";
import { submitTask } from "../../lib/submitTask";

const IMAGE_TYPES = ["Avatar", "Business visual", "Product shot", "Illustration", "Other"];

export function ImagePage() {
  const [imageType, setImageType] = useState("Avatar");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
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
    const result = await submitTask("image", { imageType, description: description.trim(), websiteUrl: websiteUrl.trim() || undefined });
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setPublicId(result.publicId);
    setSubmitted(true);
  };

  return (
    <DashboardShell title="Image">
      <div className="mx-auto max-w-3xl py-8 sm:py-10">
        <ServicePageHeader
          serviceId="image"
          title="What image do you need?"
          subtitle="Every request comes back with 3 options to pick from — not just one."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — task <strong>{publicId}</strong> is queued for your{" "}
            <strong>{imageType.toLowerCase()}</strong>. We'll notify you once it's ready.
          </SubmittedNote>
        )}
        {submitError && <ErrorNote>{submitError}</ErrorNote>}

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
            <BrandUrlField value={websiteUrl} onChange={setWebsiteUrl} />
          </SectionCard>

          <SectionCard title="Reference">
            <UploadDropzone label="Upload a reference photo or existing image (optional)" />
          </SectionCard>

          <SubmitBar loading={submitting} />
        </form>
      </div>
    </DashboardShell>
  );
}
