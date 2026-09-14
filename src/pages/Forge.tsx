import { ArrowLeft, Loader2, Mic, Paperclip, Send, Sparkles, Square, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import {
  fetchActiveConversation,
  sendForgeMessage,
  speakForgeText,
  submitForgeTasks,
  transcribeForgeVoice,
  uploadForgeFile,
  type ForgeTaskDraft,
} from "../lib/forge";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: { url: string }[];
}

interface StagedFile {
  key: string;
  name: string;
  uploading: boolean;
  url?: string;
  error?: string;
}

interface PendingSubmission {
  tasks: ForgeTaskDraft[];
  totalUsd: number | null;
  isBundle: boolean;
  walletBalanceUsd: number;
}

const SUGGESTIONS = [
  "Set up my full business for $20",
  "I need a website for my bakery",
  "Attach my logo and build me a brand kit",
  "What can Forge actually do?",
];

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m-${Date.now()}-${idCounter}`;
}

export function Forge() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [pending, setPending] = useState<PendingSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const uploadScopeId = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const existing = await fetchActiveConversation().catch(() => null);
      if (existing && existing.messages.length > 0) {
        setConversationId(existing.conversationId);
        setMessages(
          existing.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: m.attachments })),
        );
      } else {
        setMessages([
          {
            id: nextId(),
            role: "assistant",
            content:
              "Hi, I'm Forge 👋 Tell me what your business needs — a website, a logo, images, a whole Full Business Setup — in your own words, in any language, and I'll ask what I need to know, then queue it for the team.",
          },
        ]);
      }
      setLoadingHistory(false);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const handleFilePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const key = nextId();
      setStagedFiles((prev) => [...prev, { key, name: file.name, uploading: true }]);
      try {
        const { url } = await uploadForgeFile(uploadScopeId.current, file);
        setStagedFiles((prev) => prev.map((f) => (f.key === key ? { ...f, uploading: false, url } : f)));
      } catch (err) {
        setStagedFiles((prev) =>
          prev.map((f) => (f.key === key ? { ...f, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : f)),
        );
      }
    }
  };

  const removeStagedFile = (key: string) => setStagedFiles((prev) => prev.filter((f) => f.key !== key));

  const doSend = async (text: string) => {
    const trimmed = text.trim();
    const readyAttachments = stagedFiles.filter((f) => f.url).map((f) => f.url as string);
    if (!trimmed && readyAttachments.length === 0) return;

    setError("");
    setPending(null);
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: trimmed || "(sent an attachment)", attachments: readyAttachments.map((url) => ({ url })) },
    ]);
    setInput("");
    setStagedFiles([]);

    try {
      const result = await sendForgeMessage(conversationId, trimmed, readyAttachments);
      setConversationId(result.conversationId);
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: result.reply }]);
      if ((result.action === "submit_tasks" || result.action === "submit_bundle") && result.tasks.length > 0) {
        setPending({
          tasks: result.tasks,
          totalUsd: result.totalUsd,
          isBundle: result.isBundle,
          walletBalanceUsd: result.walletBalanceUsd,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    doSend(input);
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        try {
          const text = await transcribeForgeVoice(blob);
          if (text.trim()) await doSend(text);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not understand that voice message.");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Could not access your microphone.");
    }
  };

  const playReply = async (message: ChatMessage) => {
    setSpeakingId(message.id);
    try {
      const url = await speakForgeText(message.content);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch {
      setError("Could not play that reply.");
    } finally {
      setSpeakingId(null);
    }
  };

  const confirmSubmit = async () => {
    if (!pending || !conversationId) return;
    setSubmitting(true);
    setError("");
    try {
      const { publicIds, totalCharged } = await submitForgeTasks(
        conversationId,
        pending.tasks.map((t) => ({ type: t.type, subtype: t.subtype ?? null, payload: t.payload })),
        pending.isBundle,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "system",
          content: `Queued: ${publicIds.join(", ")} — $${totalCharged.toFixed(2)} charged from your wallet. We'll notify you as each one is ready.`,
        },
      ]);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const insufficientBalance = pending && pending.totalUsd !== null && pending.walletBalanceUsd < pending.totalUsd;

  return (
    <div className="flex h-screen flex-col bg-void">
      <audio ref={audioRef} className="hidden" />
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-400 text-void">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="font-display text-base font-semibold text-fg">Forge</p>
              <p className="text-xs text-fg-faint">Your task assistant</p>
            </div>
          </div>
        </div>
        <Link to="/" className="hidden sm:block">
          <Logo compact />
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 sm:px-6">
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-8">
          <div className="flex flex-col gap-5">
            {loadingHistory && <p className="text-center text-sm text-fg-faint">Loading...</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end gap-3 ${message.role === "user" ? "flex-row-reverse" : ""} ${message.role === "system" ? "justify-center" : ""}`}
              >
                {message.role !== "system" && (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      message.role === "assistant" ? "bg-yellow-400 text-void" : "bg-surface-2 text-fg"
                    }`}
                  >
                    {message.role === "assistant" ? <Sparkles className="h-4 w-4" /> : "Y"}
                  </span>
                )}
                <div
                  className={
                    message.role === "system"
                      ? "max-w-[85%] rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-center text-sm font-medium text-yellow-400"
                      : `max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                          message.role === "assistant" ? "rounded-bl-sm bg-surface text-fg" : "rounded-br-sm bg-yellow-400 text-void"
                        }`
                  }
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.attachments.map((a) => (
                        <a
                          key={a.url}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-border/60 bg-void/40 px-2 py-1 text-[11px] underline"
                        >
                          attachment
                        </a>
                      ))}
                    </div>
                  )}
                  {message.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => playReply(message)}
                      disabled={speakingId === message.id}
                      className="mt-2 flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg"
                    >
                      {speakingId === message.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                      Play
                    </button>
                  )}
                </div>
              </div>
            ))}

            {pending && (
              <div className="ml-11 max-w-[85%] rounded-2xl border-2 border-yellow-400 bg-surface p-4">
                <p className="font-display text-sm font-semibold text-fg">
                  {pending.isBundle ? "Full Business Setup" : "Ready to submit"}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-fg-muted">
                  {pending.tasks.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="capitalize">{t.type}{t.subtype ? ` — ${t.subtype}` : ""}</span>
                      {!pending.isBundle && <span className="text-fg-faint">{t.priceUsd !== null ? `$${t.priceUsd}` : "—"}</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-fg-faint">
                    Wallet balance: <strong className="text-fg">${pending.walletBalanceUsd.toFixed(2)}</strong>
                  </span>
                  <span className="font-display text-lg font-semibold text-yellow-400">
                    {pending.totalUsd !== null ? `$${pending.totalUsd.toFixed(2)}` : "—"}
                  </span>
                </div>
                {insufficientBalance ? (
                  <Link
                    to="/dashboard#billing"
                    className="mt-3 block w-full rounded-full bg-yellow-400 px-4 py-2.5 text-center text-sm font-semibold text-void transition-transform hover:-translate-y-0.5"
                  >
                    Top up wallet
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={confirmSubmit}
                    disabled={submitting || pending.totalUsd === null}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-void transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm & Submit
                  </button>
                )}
              </div>
            )}

            {sending && (
              <div className="flex items-end gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-void">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="rounded-2xl rounded-bl-sm bg-surface px-4 py-3 text-sm text-fg-faint">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border py-4">
          {error && <p className="mb-2 text-xs text-yellow-400">{error}</p>}

          {messages.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => doSend(s)}
                  className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-yellow-400/40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {stagedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {stagedFiles.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted"
                >
                  {f.uploading && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span className="max-w-[140px] truncate">{f.error ? `${f.name} (failed)` : f.name}</span>
                  <button type="button" onClick={() => removeStagedFile(f.key)} aria-label="Remove attachment">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmitForm} className="flex items-center gap-1.5 rounded-full border-2 border-yellow-400/30 bg-surface py-1.5 pr-1.5 pl-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={transcribing ? "Transcribing..." : "Tell Forge what you need..."}
              disabled={sending || transcribing}
              className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFilePick(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach a file"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? "Stop recording" : "Record a voice message"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                recording ? "bg-yellow-400 text-void" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="submit"
              disabled={sending || transcribing || (!input.trim() && stagedFiles.every((f) => !f.url))}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-void transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
