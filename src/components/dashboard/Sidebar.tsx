import { Link } from "react-router-dom";
import { Logo } from "../Logo";
import { services, type Service } from "../../data/services";

type Props = {
  activeId: string;
  onSelect: (service: Service) => void;
};

export function Sidebar({ activeId, onSelect }: Props) {
  return (
    <aside className="flex h-full w-16 shrink-0 flex-col border-r border-ink/10 bg-white md:w-64">
      <div className="border-b border-ink/10 px-3 py-5 md:px-5">
        <Link to="/" className="flex justify-center md:justify-start">
          <Logo compact className="md:hidden" />
          <Logo className="hidden md:flex" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 md:px-3">
        <p className="hidden px-2 pb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase md:block">
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
                  className={`flex w-full items-center justify-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm font-medium transition-colors md:justify-start md:px-3 ${
                    active
                      ? "bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-pop-sm"
                      : service.comingSoon
                        ? "cursor-not-allowed text-ink-faint"
                        : "text-ink-soft hover:bg-cream-dim"
                  }`}
                >
                  <service.icon
                    className={`h-4.5 w-4.5 shrink-0 ${active ? "text-white" : service.comingSoon ? "text-ink-faint" : "text-ink-soft"}`}
                    strokeWidth={2.25}
                  />
                  <span className="hidden flex-1 truncate md:inline">{service.label}</span>
                  {service.comingSoon && (
                    <span className="hidden rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase md:inline-block">
                      Soon
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-ink/10 p-2 md:p-4">
        <div className="rounded-xl border border-dashed border-ink/20 bg-cream-dim px-1 py-2.5 text-center text-xs font-medium text-ink-faint md:px-3">
          <span className="md:hidden" aria-label="Design preview — nothing here is live yet">
            🚧
          </span>
          <span className="hidden md:inline">🚧 Design preview — nothing here is live yet</span>
        </div>
      </div>
    </aside>
  );
}
