import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ChipToggle, ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote } from "../../components/dashboard/form";
import { submitTask } from "../../lib/submitTask";

const REQUEST_TYPES = [
  { id: "posts", label: "Post pack (3 designs)", blurb: "3 ready-to-publish post designs for your platforms." },
  { id: "profile", label: "Profile kit", blurb: "Matching profile picture + correctly sized cover/banner images." },
  { id: "captions", label: "Caption & hashtag pack", blurb: "A month's worth of captions + hashtags for your launch." },
  { id: "gbp", label: "Google Business Profile content", blurb: "Description, categories, and an opening post." },
];

const PLATFORMS = ["Instagram", "Facebook", "LinkedIn", "X", "TikTok", "YouTube"];

export function SocialMediaPage() {
  const [requestType, setRequestType] = useState("posts");
  const [platforms, setPlatforms] = useState<string[]>(["Instagram", "Facebook"]);
  const [description, setDescription] = useState("");
  const [descError, setDescError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [publicId, setPublicId] = useState("");

  const togglePlatform = (platform: string) => {
    setPlatforms((prev) => (prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setDescError(true);
      return;
    }
    setDescError(false);
    setSubmitError("");
    setSubmitting(true);
    const result = await submitTask("social", { requestType, platforms, description: description.trim() });
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setPublicId(result.publicId);
    setSubmitted(true);
  };

  return (
    <DashboardShell crumb="Dashboard / Social Media" title="Posts, profile kits & captions.">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <ServicePageHeader
          eta="~15 min"
          price="from $18"
          title="What do you need for social?"
          subtitle="Post and design requests default to at least 3 options — never just one. Need TikTok/Reels/YouTube video content? That's the Video service."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — task <strong>{publicId}</strong> is queued. We'll notify you once it's ready.
          </SubmittedNote>
        )}
        {submitError && <ErrorNote>{submitError}</ErrorNote>}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="What kind of request">
            <div className="grid gap-3 sm:grid-cols-2">
              {REQUEST_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setRequestType(type.id)}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${
                    requestType === type.id ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-fg">{type.label}</p>
                  <p className="mt-1 text-sm text-fg-muted">{type.blurb}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Platforms">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <ChipToggle
                  key={platform}
                  label={platform}
                  active={platforms.includes(platform)}
                  onClick={() => togglePlatform(platform)}
                />
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
                placeholder="e.g. A week of Instagram + Facebook posts for my bakery's grand opening — bright, fun..."
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
