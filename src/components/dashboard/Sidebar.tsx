import { Link } from "react-router-dom";
import { Logo } from "../Logo";
import { services, type Service } from "../../data/services";

type Props = {
  activeId: string;
  onSelect: (service: Service) => void;
};

export function Sidebar({ activeId, onSelect }: Props) {
  return (
    <aside className="flex h-full w-16 shrink-0 flex-col border-r border-border bg-surface md:w-64">
      <div className="border-b border-border px-3 py-5 md:px-5">
        <Link to="/" className="flex justify-center md:justify-start">
          <Logo compact className="md:hidden" />
          <Logo className="hidden md:flex" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 md:px-3">
        <p className="hidden px-2 pb-2 text-xs font-semibold tracking-wide text-fg-faint uppercase md:block">
          Services
        </p>
        <ul className="flex flex-col gap-1">
          {services.map((service) => {
            const active = service.id === activeId;
            return (
              <li key={service.id}>
                <button
                  type="button"
                  disabled={service.comingSoon}
                  onClick={() => onSelect(service)}
                  title={service.label}
                  className={`group flex w-full items-center justify-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm font-medium transition-all duration-200 md:justify-start md:px-2.5 ${
                    active
                      ? "bg-yellow-400 text-void"
                      : service.comingSoon
                        ? "cursor-not-allowed text-fg-faint"
                        : "text-fg-muted hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ${
                      active
                        ? ""
                        : service.comingSoon
                          ? "bg-fg-faint/10"
                          : "bg-yellow-400/10 group-hover:scale-105 group-hover:bg-yellow-400/20"
                    }`}
                  >
                    <service.icon
                      className={`h-4.5 w-4.5 ${
                        active ? "text-void" : service.comingSoon ? "text-fg-faint" : "text-yellow-400"
                      }`}
                      strokeWidth={2.25}
                    />
                  </span>
                  <span className="hidden flex-1 truncate md:inline">{service.label}</span>
                  {service.comingSoon && (
                    <span className="hidden rounded-full bg-fg-faint/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase md:inline-block">
                      Soon
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2 md:p-4">
        <div className="rounded-xl border border-dashed border-border bg-void px-1 py-2.5 text-center text-xs font-medium text-fg-faint md:px-3">
          <span className="md:hidden" aria-label="Design preview — nothing here is live yet">
            🚧
          </span>
          <span className="hidden md:inline">🚧 Design preview — nothing here is live yet</span>
        </div>
      </div>
    </aside>
  );
}
