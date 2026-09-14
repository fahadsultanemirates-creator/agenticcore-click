import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ErrorNote, inputClass, SectionCard, ServicePageHeader, SubmitBar, SubmittedNote } from "../../components/dashboard/form";
import { submitTask } from "../../lib/submitTask";

const DOC_TYPES = [
  { id: "invoice", label: "Invoice / quotation template", blurb: "Your branding, ready to send." },
  { id: "terms", label: "Terms & Conditions + Privacy Policy", blurb: "Standard boilerplate for your website." },
  { id: "plan", label: "One-page business plan", blurb: "A pitch one-pager for a bank or investor." },
  { id: "proposal", label: "Proposal / quote template", blurb: "For sending scoped offers to clients." },
  { id: "contract", label: "Service agreement template", blurb: "A simple contract to formalize work." },
];

export function BusinessDocumentsPage() {
  const [docType, setDocType] = useState("invoice");
  const [description, setDescription] = useState("");
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
    const result = await submitTask("documents", { docType, description: description.trim() });
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setPublicId(result.publicId);
    setSubmitted(true);
  };

  return (
    <DashboardShell crumb="Dashboard / Business Documents" title="Invoices, contracts, proposals.">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <ServicePageHeader
          eta="~10 min"
          price="from $10"
          title="Which document do you need?"
          subtitle="The paperwork every business needs but rarely gets around to drafting."
        />

        {submitted && (
          <SubmittedNote>
            Thanks — task <strong>{publicId}</strong> is queued. We'll notify you once it's ready.
          </SubmittedNote>
        )}
        {submitError && <ErrorNote>{submitError}</ErrorNote>}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <SectionCard title="Document type">
            <div className="grid gap-3 sm:grid-cols-2">
              {DOC_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setDocType(type.id)}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${
                    docType === type.id ? "border-yellow-400 bg-yellow-400/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-fg">{type.label}</p>
                  <p className="mt-1 text-sm text-fg-muted">{type.blurb}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="The brief">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                Tell us about your business <span className="text-yellow-400">*</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (e.target.value.trim()) setDescError(false);
                }}
                rows={4}
                placeholder="e.g. A service agreement template for a freelance photography business..."
                className={`${inputClass} resize-none`}
              />
              {descError && <span className="text-xs text-yellow-400">Tell us a bit about what you need.</span>}
            </label>
          </SectionCard>

          <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-void p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />
            <p className="text-xs text-fg-faint">
              These are standard templates for convenience, not legal advice — for anything with
              real legal weight, have a lawyer review the final document.
            </p>
          </div>

          <SubmitBar loading={submitting} />
        </form>
      </div>
    </DashboardShell>
  );
}
