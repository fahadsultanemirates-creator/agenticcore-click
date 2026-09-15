import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote, UploadDropzone } from "../../components/dashboard/form";
import { AvatarPicker, VoicePicker, type CharacterChoice } from "../../components/dashboard/CharacterPicker";
import { submitTask } from "../../lib/submitTask";

type Length = "short" | "long";
type AvatarStyle = "standard" | "premium" | "elite" | "none";
type Resolution = "720p" | "1080p";
type NoAvatarMode = "full" | "hybrid";

const AVATAR_STYLES: { id: AvatarStyle; label: string; blurb: string }[] = [
  { id: "standard", label: "Standard avatar", blurb: "Clean, reliable avatar delivery." },
  { id: "premium", label: "Premium avatar", blurb: "Higher-fidelity avatar motion & voice." },
  { id: "elite", label: "Elite avatar", blurb: "Our best avatar quality available." },
  { id: "none", label: "No avatar", blurb: "Business promo — B-roll, graphics, motion only." },
];

const SHORT_PRICES: Record<Exclude<AvatarStyle, "none">, Record<Resolution, string>> = {
  standard: { "720p": "$15", "1080p": "$20" },
  premium: { "720p": "$30", "1080p": "$40" },
  elite: { "720p": "$55", "1080p": "$70" },
};

const SHORT_NO_AVATAR_PRICES: Record<NoAvatarMode, string> = {
  full: "$10",
  hybrid: "$25",
};

const LONG_PRICES: Record<Exclude<AvatarStyle, "none">, string> = {
  standard: "$60",
  premium: "$120",
  elite: "$200",
};

export function VideoPage() {
  const [length, setLength] = useState<Length>("short");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("standard");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [noAvatarMode, setNoAvatarMode] = useState<NoAvatarMode>("full");
  const [duration, setDuration] = useState("30s");
  const [avatarChoice, setAvatarChoice] = useState<CharacterChoice | null>(null);
  const [voiceChoice, setVoiceChoice] = useState<CharacterChoice | null>(null);
  const [description, setDescription] = useState("");
  const [descError, setDescError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [publicId, setPublicId] = useState("");

  const price =
    length === "short"
      ? avatarStyle === "none"
        ? SHORT_NO_AVATAR_PRICES[noAvatarMode]
        : SHORT_PRICES[avatarStyle][resolution]
      : avatarStyle === "none"
        ? "from $50"
        : LONG_PRICES[avatarStyle];

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
      length,
      avatarStyle,
      resolution,
      noAvatarMode,
      duration: length === "long" ? duration : undefined,
      description: description.trim(),
      avatarSource: avatarStyle !== "none" ? avatarChoice?.source : undefined,
      avatarProviderId: avatarStyle !== "none" ? avatarChoice?.providerId : undefined,
      avatarType: avatarStyle !== "none" ? avatarChoice?.avatarType : undefined,
      voiceSource: avatarStyle !== "none" ? voiceChoice?.source : undefined,
      voiceProviderId: avatarStyle !== "none" ? voiceChoice?.providerId : undefined,
    });
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
        <ServicePageHeader
          serviceId="video"
          eta={length === "short" ? "~10 min" : "~1–2 days"}
          price={price}
          title="What kind of video do you need?"
          subtitle="Pick a length, then a style — the price updates as you go."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — task <strong>{publicId}</strong> is queued (
            {length === "short" ? "short clip" : "long video"}, {price}). We'll notify you once it's ready.
          </SubmittedNote>
        )}
        {submitError && <ErrorNote>{submitError}</ErrorNote>}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="Length">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setLength("short")}
                className={`rounded-xl border-2 p-4 text-left transition-colors ${
                  length === "short" ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                }`}
              >
                <p className="font-semibold text-fg">Short clip — 5 to 15 seconds</p>
                <p className="mt-1 text-sm text-fg-muted">Avatar or promo-only, quick turnaround.</p>
              </button>
              <button
                type="button"
                onClick={() => setLength("long")}
                className={`rounded-xl border-2 p-4 text-left transition-colors ${
                  length === "long" ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                }`}
              >
                <p className="font-semibold text-fg">Long video — 30 seconds+</p>
                <p className="mt-1 text-sm text-fg-muted">Fuller promo or explainer piece.</p>
              </button>
            </div>
          </SectionCard>

          {length === "long" && (
            <SectionCard title="Duration">
              <div className="flex flex-wrap gap-2">
                {["30s", "60s", "90s+"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      duration === d ? "border-yellow-400 bg-yellow-400 text-void" : "border-border text-fg-muted hover:border-yellow-400/50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

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

            {avatarStyle !== "none" && length === "short" && (
              <div>
                <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Resolution</span>
                <div className="mt-2 flex gap-2">
                  {(["720p", "1080p"] as Resolution[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                        resolution === r ? "border-yellow-400 bg-yellow-400 text-void" : "border-border text-fg-muted hover:border-yellow-400/50"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {avatarStyle === "none" && length === "short" && (
              <div>
                <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  How much of the video should use an avatar?
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNoAvatarMode("full")}
                    className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                      noAvatarMode === "full" ? "border-yellow-400 bg-yellow-400 text-void" : "border-border text-fg-muted hover:border-yellow-400/50"
                    }`}
                  >
                    None at all
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoAvatarMode("hybrid")}
                    className={`rounded-full border-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                      noAvatarMode === "hybrid" ? "border-yellow-400 bg-yellow-400 text-void" : "border-border text-fg-muted hover:border-yellow-400/50"
                    }`}
                  >
                    Hybrid — avatar for ~40–50%
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-fg-faint">Charged from your wallet balance once you submit.</p>
          </SectionCard>

          {avatarStyle !== "none" && (
            <>
              <SectionCard title="Choose an avatar">
                <p className="text-xs text-fg-faint">
                  Pick from our library, or upload your own photo — it's free to create and stays saved for future videos.
                </p>
                <AvatarPicker value={avatarChoice} onChange={setAvatarChoice} />
              </SectionCard>

              <SectionCard title="Choose a voice">
                <p className="text-xs text-fg-faint">
                  Pick from our library, or clone your own voice — free to create, saved for future videos.
                </p>
                <VoicePicker value={voiceChoice} onChange={setVoiceChoice} />
              </SectionCard>
            </>
          )}

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
          </SectionCard>

          <SectionCard title="Assets">
            <UploadDropzone label="Upload a script, product shots, or reference video (optional)" />
          </SectionCard>

          <SubmitBar loading={submitting} />
        </form>
      </div>
    </DashboardShell>
  );
}
