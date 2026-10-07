import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote, BrandUrlField, UploadDropzone } from "../../components/dashboard/form";
import { submitTask } from "../../lib/submitTask";
import { useProjectContext } from "../../lib/useProjectContext";
import { ProjectBanner } from "../../components/dashboard/ProjectBanner";
import { useReferenceFiles } from "../../lib/useReferenceFiles";

// One length, two styles.
//
// The long tier is gone, and so is the avatar/voice picker that sat under
// it. Both existed for a render engine we no longer use: the presenter was
// chosen from a library of someone else's faces, and the long video was
// billed in 30-second blocks against that engine's per-minute rate.
//
// What is left is the choice that actually changes the deliverable — is
// somebody speaking, or is it a moving scene — and the resolution, which is
// the only thing that moves the price.
type AvatarStyle = "standard" | "none";

const AVATAR_STYLES: { id: AvatarStyle; label: string; blurb: string }[] = [
  { id: "standard", label: "With a presenter", blurb: "Someone speaks your script to camera." },
  { id: "none", label: "No presenter", blurb: "A moving scene — product, place, atmosphere." },
];

// Mirrors VIDEO_USD in supabase/functions/_shared/pricing.ts, which is
// what actually charges. One price now: resolution was never a real
// difference to sell, and an avatar costs the same as a moving scene.
const PRICE_USD = 3;

export function VideoPage() {
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("standard");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [descError, setDescError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [publicId, setPublicId] = useState("");
  const project = useProjectContext();
  const references = useReferenceFiles(project.files);

  const price = `$${PRICE_USD}`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setDescError(true);
      return;
    }
    setDescError(false);
    setSubmitError("");
    setSubmitting(true);
    const result = await submitTask("video", {
      // Still sent, and still 'short': the worker and the catalog selector
      // both read it, and every clip is short now.
      length: "short",
      avatarStyle,
      // Every clip is 1080p; the field stays because the worker and the
      // catalog selector both still read it.
      resolution: "1080p",
      noAvatarMode: avatarStyle === "none" ? "full" : undefined,
      description: description.trim(),
      websiteUrl: websiteUrl.trim() || undefined,
      referenceFiles: references.urls,
    }, { projectId: project.projectId });
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setPublicId(result.publicId);
    setSubmitted(true);
  };

  return (
    <DashboardShell title="Video">
      <div className="mx-auto max-w-3xl py-8 sm:py-10">
        <ProjectBanner projectId={project.projectId} name={project.name} />
        <ServicePageHeader
          serviceId="video"
          eta="~10 min"
          price={price}
          title="What should the video show?"
          subtitle="One clip, 10–15 seconds, 1080p. $3 whether someone speaks or not."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — task <strong>{publicId}</strong> is queued ({price}). We'll notify you once
            it's ready.
          </SubmittedNote>
        )}
        {submitError && <ErrorNote>{submitError}</ErrorNote>}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="Style">
            <div className="grid gap-3 sm:grid-cols-2">
              {AVATAR_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setAvatarStyle(style.id)}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${
                    avatarStyle === style.id ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-fg">{style.label}</p>
                    {avatarStyle === style.id && <Check className="h-4 w-4 text-yellow-400" />}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{style.blurb}</p>
                </button>
              ))}
            </div>

            <p className="text-xs text-fg-faint">Charged from your wallet balance once you submit.</p>
          </SectionCard>

          <SectionCard title="The brief">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                Describe what the video is for <span className="text-yellow-400">*</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (e.target.value.trim()) setDescError(false);
                }}
                rows={4}
                placeholder="e.g. A 15-second Instagram teaser announcing my bakery's grand opening..."
                className={`${inputClass} resize-none`}
              />
              {descError && <span className="text-xs text-yellow-400">Tell us a bit about what you need.</span>}
            </label>
            <BrandUrlField value={websiteUrl} onChange={setWebsiteUrl} />
          </SectionCard>

          <SectionCard title="Assets">
            <UploadDropzone
              label="Upload a script, product shots, or reference video (optional)"
              files={references.files}
              uploading={references.uploading}
              error={references.error}
              onAdd={references.add}
              onRemove={references.remove}
            />
          </SectionCard>

          <SubmitBar loading={submitting} />
        </form>
      </div>
    </DashboardShell>
  );
}
