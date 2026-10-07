import { Download, ExternalLink, Eye } from "lucide-react";
import { services } from "../../data/services";
import { deliverableFilename, forcedDownloadUrl } from "../../lib/downloadUrl";
import type { Order } from "../../lib/useOrders";

type Props = {
  orders: Order[];
  loading: boolean;
  onOpen: (taskId: string) => void;
};

// Real deliverables, read from `task_files`. A website's "file" is its
// deployed URL rather than a download, so the primary action follows what the
// product actually is instead of always saying "Download".
export function DeliverablesSection({ orders, loading, onOpen }: Props) {
  const delivered = orders.filter((order) => order.status === "delivered");

  return (
    <section id="deliverables" className="scroll-mt-20 border-t border-border py-10">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold text-fg sm:text-2xl">Deliverables</h2>
        <p className="mt-1 text-sm text-fg-muted">Finished work, ready to download.</p>
      </div>

      {loading ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
          Loading…
        </p>
      ) : delivered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-fg-faint">
          Nothing delivered yet — once a service is generated, it'll show up here.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {delivered.map((order) => {
            const service = services.find((s) => s.id === order.serviceId);
            const primary = order.previewUrl ?? order.files[0]?.url ?? null;
            const isSite = order.previewUrl !== null;
            // Image products ship as five options and video as three. Every
            // one is something the client paid for, so all of them get a link
            // -- choosing between them IS the revision for these products.
            const alternates = isSite ? [] : order.files.slice(1);

            // "Download" has to download. Supabase answers with
            // Content-Disposition: attachment when asked, and names the
            // file after the order rather than the Telegram id it was
            // stored under. A link we do not host cannot be forced, so
            // that button says "Open" instead of lying.
            const saveUrl = (file: { url: string; optionIndex: number }) =>
              forcedDownloadUrl(
                file.url,
                deliverableFilename(order.publicId, file.optionIndex, file.url, order.files.length)
              );
            const first = order.files[0] ?? null;
            const primarySave = isSite || !first ? null : saveUrl(first);

            // Five logos look identical as five links. Showing them is
            // the difference between choosing and guessing.
            const thumbnails = isSite ? [] : order.files.filter((f) => f.fileType?.startsWith("image/"));

            return (
              <div
                key={order.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10">
                    {service ? <service.icon className="h-5 w-5 text-yellow-400" strokeWidth={2.25} /> : null}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold text-fg">{order.product}</p>
                    <p className="text-xs text-fg-faint">
                      {order.publicId} &middot; {order.requestedAt}
                    </p>
                  </div>
                  {order.isNew ? (
                    <span className="ml-auto shrink-0 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold text-void">
                      NEW
                    </span>
                  ) : null}
                </div>

                <p className="text-sm text-fg-muted">{order.summary}</p>
                {alternates.length > 0 ? (
                  <p className="text-xs text-fg-faint">
                    {order.files.length} options to choose from
                  </p>
                ) : null}

                {thumbnails.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {thumbnails.map((file) => (
                      <a
                        key={`thumb-${file.optionIndex}-${file.url}`}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onOpen(order.id)}
                        title={`Option ${file.optionIndex} — open full size`}
                        className="block h-16 w-16 overflow-hidden rounded-xl border border-border transition-colors hover:border-yellow-400/60"
                      >
                        <img
                          src={file.url}
                          alt={`Option ${file.optionIndex}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto flex gap-2 pt-1">
                  {primary ? (
                    <a
                      href={primarySave ?? primary}
                      {...(primarySave ? {} : { target: "_blank", rel: "noreferrer" })}
                      onClick={() => onOpen(order.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-yellow-400 px-3 py-2 text-xs font-semibold text-void transition-transform hover:-translate-y-0.5"
                    >
                      {isSite ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> Open site
                        </>
                      ) : primarySave ? (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          {order.files.length > 1 ? "Download option 1" : "Download"}
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </>
                      )}
                    </a>
                  ) : (
                    // Delivered but no file row -- worth showing plainly rather
                    // than rendering a button that leads nowhere.
                    <span className="flex-1 rounded-full border-2 border-border px-3 py-2 text-center text-xs font-semibold text-fg-faint">
                      No file attached
                    </span>
                  )}

                </div>

                {alternates.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {alternates.map((file) => {
                      const save = saveUrl(file);
                      return (
                        <a
                          key={`save-${file.optionIndex}-${file.url}`}
                          href={save ?? file.url}
                          {...(save ? {} : { target: "_blank", rel: "noreferrer" })}
                          onClick={() => onOpen(order.id)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:border-yellow-400/50 hover:text-fg"
                        >
                          {save ? <Download className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                          Option {file.optionIndex}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
