import { Loader2, Upload } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import {
  createCustomAvatar,
  createCustomVoice,
  fetchCatalog,
  fetchMyAvatars,
  type CatalogOption,
  type ClientAvatar,
} from "../../lib/avatars";

export interface CharacterChoice {
  source: "catalog" | "custom";
  providerId: string;
  avatarType?: "avatar" | "talking_photo";
}

const cardClass = (active: boolean) =>
  `flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-colors ${
    active ? "border-yellow-400 bg-yellow-400/5" : "border-border hover:border-yellow-400/40"
  }`;

export function AvatarPicker({
  value,
  onChange,
}: {
  value: CharacterChoice | null;
  onChange: (choice: CharacterChoice) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [mine, setMine] = useState<ClientAvatar[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const load = async () => {
    const [c, m] = await Promise.all([fetchCatalog("avatar"), fetchMyAvatars("avatar")]);
    setCatalog(c);
    setMine(m);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const result = await createCustomAvatar(file, "My avatar");
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    onChange({ source: "custom", providerId: result.providerId, avatarType: "talking_photo" });
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {catalog.map((a) => (
          <button
            type="button"
            key={a.id}
            onClick={() => onChange({ source: "catalog", providerId: a.provider_id, avatarType: "avatar" })}
            className={cardClass(value?.source === "catalog" && value.providerId === a.provider_id)}
          >
            {a.preview_url && <img src={a.preview_url} alt={a.name} className="h-24 w-full rounded-lg object-cover" />}
            <p className="text-xs font-medium text-fg">{a.name}</p>
          </button>
        ))}

        {mine.map((a) => (
          <button
            type="button"
            key={a.id}
            disabled={a.status !== "ready"}
            onClick={() =>
              a.provider_id && onChange({ source: "custom", providerId: a.provider_id, avatarType: "talking_photo" })
            }
            className={`${cardClass(value?.source === "custom" && value.providerId === a.provider_id)} ${
              a.status !== "ready" ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {a.preview_url && <img src={a.preview_url} alt={a.name} className="h-24 w-full rounded-lg object-cover" />}
            <p className="text-xs font-medium text-fg">
              {a.name}
              {a.status !== "ready" && ` (${a.status === "pending" ? "creating..." : "failed"})`}
            </p>
          </button>
        ))}

        <label className="flex h-full min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-3 text-center text-xs text-fg-faint transition-colors hover:border-yellow-400/50">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {uploading ? "Creating..." : "Upload your own photo"}
          <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={uploading} onChange={handleFile} />
        </label>
      </div>
      {uploadError && <p className="text-xs text-yellow-400">{uploadError}</p>}
    </div>
  );
}

export function VoicePicker({
  value,
  onChange,
}: {
  value: CharacterChoice | null;
  onChange: (choice: CharacterChoice) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [mine, setMine] = useState<ClientAvatar[]>([]);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const load = async () => {
    const [c, m] = await Promise.all([fetchCatalog("voice"), fetchMyAvatars("voice")]);
    setCatalog(c);
    setMine(m);
  };

  useEffect(() => {
    load();
  }, []);

  // Voice cloning is async -- poll our own list until the new one leaves
  // "pending" so the client sees it become selectable without a refresh.
  useEffect(() => {
    if (!mine.some((v) => v.status === "pending")) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [mine]);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!consent) {
      setUploadError("Please confirm you have the right to clone this voice first.");
      return;
    }
    setUploading(true);
    setUploadError("");
    const result = await createCustomVoice(file, "My voice", consent);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalog.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => onChange({ source: "catalog", providerId: v.provider_id })}
            className={cardClass(value?.source === "catalog" && value.providerId === v.provider_id)}
          >
            <p className="text-sm font-medium text-fg">
              {v.name} {v.language && <span className="text-fg-faint">({v.language})</span>}
            </p>
            {v.preview_url && (
              <audio controls src={v.preview_url} className="h-8 w-full" onClick={(e) => e.stopPropagation()} />
            )}
          </button>
        ))}

        {mine.map((v) => (
          <button
            type="button"
            key={v.id}
            disabled={v.status !== "ready"}
            onClick={() => v.provider_id && onChange({ source: "custom", providerId: v.provider_id })}
            className={`${cardClass(value?.source === "custom" && value.providerId === v.provider_id)} ${
              v.status !== "ready" ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            <p className="text-sm font-medium text-fg">
              {v.name}
              {v.status !== "ready" && ` (${v.status === "pending" ? "cloning..." : "failed"})`}
            </p>
            {v.preview_url && v.status === "ready" && (
              <audio controls src={v.preview_url} className="h-8 w-full" onClick={(e) => e.stopPropagation()} />
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border-2 border-dashed border-border p-4">
        <label className="flex items-start gap-2 text-xs text-fg-faint">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-yellow-400"
          />
          I confirm I have the right to clone this voice (it's my own voice, or I have explicit permission from its owner).
        </label>
        <label
          className={`mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-xs text-fg-faint transition-colors ${
            consent ? "hover:border-yellow-400/50" : "cursor-not-allowed opacity-50"
          }`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Starting clone..." : "Upload a voice sample (MP3/WAV, 30s+)"}
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/webm,audio/mp4"
            className="hidden"
            disabled={uploading || !consent}
            onChange={handleFile}
          />
        </label>
      </div>
      {uploadError && <p className="text-xs text-yellow-400">{uploadError}</p>}
    </div>
  );
}
