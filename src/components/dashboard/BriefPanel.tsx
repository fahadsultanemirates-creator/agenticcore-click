import { Paperclip, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Service } from "../../data/services";

type Props = {
  service: Service;
  brief: string;
  onBriefChange: (value: string) => void;
  onGenerate: () => void;
  status: "idle" | "generating" | "done";
};

export function BriefPanel({ service, brief, onBriefChange, onGenerate, status }: Props) {
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col justify-center px-8 py-10 sm:px-12 lg:px-16">
      <div className="mx-auto w-full max-w-xl animate-fade-up">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-yellow-400">
          <Sparkles className="h-4 w-4" />
          {service.eta} &middot; {service.price}
        </div>

        <h2 className="font-display text-3xl leading-tight font-semibold text-fg sm:text-4xl">
          {service.prompt}
        </h2>

        <div className="relative mt-6">
          <textarea
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            placeholder={service.placeholder}
            rows={5}
            className="w-full resize-none rounded-2xl border-2 border-yellow-400/30 bg-surface p-4 pr-12 text-fg transition-colors placeholder:text-fg-faint focus:border-yellow-400 focus:outline-none"
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => setAttachedFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a logo, image, or document"
            title="Attach a logo, image, or document"
            className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-surface-2 hover:text-yellow-400"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>

        {attachedFile && (
          <div className="mt-2 flex w-fit items-center gap-2 rounded-full border border-border bg-surface py-1 pr-1 pl-3 text-xs text-fg-muted">
            <Paperclip className="h-3 w-3 text-yellow-400" />
            <span className="max-w-40 truncate">{attachedFile.name}</span>
            <button
              type="button"
              onClick={() => {
                setAttachedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              aria-label="Remove attachment"
              className="flex h-5 w-5 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {service.chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onBriefChange(chip)}
              className="rounded-full border-2 border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:border-yellow-400 hover:text-fg"
            >
              {chip}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={status === "generating" || brief.trim().length === 0}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-7 py-3.5 text-base font-semibold text-void shadow-glow-yellow transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {status === "generating" ? "Generating..." : "Generate"}
          {status !== "generating" && <Sparkles className="h-4 w-4" />}
        </button>

        <p className="mt-3 text-xs text-fg-faint">
          Mockup only — this simulates the flow, no request is actually sent anywhere.
        </p>
      </div>
    </div>
  );
}
