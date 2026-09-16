import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote, BrandUrlField, UploadDropzone } from "../../components/dashboard/form";
import { AvatarPicker, VoicePicker, type CharacterChoice } from "../../components/dashboard/CharacterPicker";
import { submitTask } from "../../lib/submitTask";
import { useReferenceFiles } from "../../lib/useReferenceFiles";

type Length = "short" | "long";
// Avatar quality tiers are gone: they never changed the delivered video
// (every tier fell back to the same house avatar) and they no longer change
// the price either -- short is priced on resolution, long on duration.
type AvatarStyle = "standard" | "none";
type Resolution = "720p" | "1080p";

const AVATAR_STYLES: { id: AvatarStyle; label: string; blurb: string }[] = [
  { id: "standard", label: "With an avatar", blurb: "A presenter speaks your script to camera." },
  { id: "none", label: "No avatar", blurb: "Business promo — B-roll, graphics, motion only." },
];

// Short clips cost the same whether or not there's an avatar -- only the
// resolution moves the price.
const SHORT_PRICES: Record<Resolution, number> = { "720p": 1, "1080p": 1.5 };

// Long videos are avatar-only (grok-imagine-video caps a clip at 15s, so a
// longer no-avatar video isn't something we can actually deliver) and are
// sold in 30-second blocks up to 10 minutes.
const LONG_BLOCK_USD = 3;
const LONG_BLOCK_SECONDS = 30;
const LONG_MAX_BLOCKS = 20;
const LONG_BLOCK_CHOICES = [1, 2, 4, 6, 10, 20];

function formatUsd(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

function blockLabel(blocks: number): string {
  const seconds = blocks * LONG_BLOCK_SECONDS;
  return seconds < 60 ? `${seconds}s` : `${seconds / 60} min`;
}

export function VideoPage() {
  const [length, setLength] = useState<Length>("short");
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("standard");
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [blocks, setBlocks] = useState(2);
  const [avatarChoice, setAvatarChoice] = useState<CharacterChoice | null>(null);
  const [voiceChoice, setVoiceChoice] = useState<CharacterChoice | null>(null);
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [descError, setDescError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [publicId, setPublicId] = useState("");
  const references = useReferenceFiles();

  // Long videos are always avatar-presented, whatever the style toggle says.
  const usesAvatar = length === "long" || avatarStyle !== "none";
  const priceUsd = length === "short" ? SHORT_PRICES[resolution] : blocks * LONG_BLOCK_USD;
  const price = formatUsd(priceUsd);

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
      // Long is avatar-only, so never send "none" with it.
      avatarStyle: length === "long" ? "standard" : avatarStyle,
      resolution: length === "short" ? resolution : undefined,
      noAvatarMode: length === "short" && avatarStyle === "none" ? "full" : undefined,
      durationSeconds: length === "long" ? blocks * LONG_BLOCK_SECONDS : undefined,
      description: description.trim(),
      websiteUrl: websiteUrl.trim() || undefined,
      avatarSource: usesAvatar ? avatarChoice?.source : undefined,
      avatarProviderId: usesAvatar ? avatarChoice?.providerId : undefined,
      avatarType: usesAvatar ? avatarChoice?.avatarType : undefined,
      voiceSource: usesAvatar ? voiceChoice?.source : undefined,
      voiceProviderId: usesAvatar ? voiceChoice?.providerId : undefined,
      referenceFiles: references.urls,
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
          eta={length === "short" ? "~10 min" : "~30 min"}
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
                <p className="font-semibold text-fg">Long video — 30 sec to 10 min</p>
                <p className="mt-1 text-sm text-fg-muted">Avatar-presented, billed in 30-second blocks.</p>
              </button>
            </div>
          </SectionCard>

          {length === "long" && (
            <SectionCard title="Duration">
              <div className="flex flex-wrap gap-2">
                {LONG_BLOCK_CHOICES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBlocks(b)}
                    className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      blocks === b ? "border-yellow-400 bg-yellow-400 text-void" : "border-border text-fg-muted hover:border-yellow-400/50"
                    }`}
                  >
                    {blockLabel(b)} — {formatUsd(b * LONG_BLOCK_USD)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-faint">
                {formatUsd(LONG_BLOCK_USD)} per 30 seconds, up to {blockLabel(LONG_MAX_BLOCKS)}.
              </p>
            </SectionCard>
          )}

          <SectionCard title={length === "long" ? "Presenter" : "Style"}>
            {length === "long" ? (
              <p className="text-sm text-fg-muted">
                Long videos are always avatar-presented — that's the only way we can deliver past 15
                seconds, so there's no avatar-free option here.
              </p>
            ) : (
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
            )}

            {length === "short" && (
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
                      {r} — {formatUsd(SHORT_PRICES[r])}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-fg-faint">Charged from your wallet balance once you submit.</p>
          </SectionCard>

          {usesAvatar && (
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
