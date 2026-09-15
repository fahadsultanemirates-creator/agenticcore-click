import {
  Clapperboard,
  FileSignature,
  FileText,
  Globe,
  Image,
  Palette,
  Share2,
  type LucideIcon,
} from "lucide-react";

export type ServiceMeta = {
  id: string;
  label: string;
  tagline: string;
  icon: LucideIcon;
  route: string;
  /** Display price shown on the dashboard card and the service page header. */
  price: string;
  /** Typical turnaround, shown next to the price. */
  eta: string;
  /** One extra line of detail, used on the dashboard cards. */
  detail: string;
};

// Final list — 7 services, each its own dedicated page reached from the
// dashboard grid (there is no left service rail any more; the grid *is* the
// navigation).
//
// PRICES LIVE HERE. Every service page header and dashboard card reads these,
// so a price change is a one-line edit in this file — nothing else in the UI
// hardcodes a number. The server-side source of truth for what actually gets
// charged is supabase/functions/_shared/pricing.ts; keep the two in step.
export const services: ServiceMeta[] = [
  {
    id: "website",
    label: "Website",
    tagline: "A real site, live fast.",
    icon: Globe,
    route: "/dashboard/website",
    price: "from $49",
    eta: "~20 min",
    detail: "2–10 pages, written, designed and deployed live.",
  },
  {
    id: "pdf",
    label: "PDF & Documents",
    tagline: "Presentations, brochures, flyers & more.",
    icon: FileText,
    route: "/dashboard/pdf",
    price: "from $15",
    eta: "~15 min",
    detail: "Print-ready decks, brochures, flyers and banners.",
  },
  {
    id: "image",
    label: "Image",
    tagline: "Custom art, avatars & business visuals.",
    icon: Image,
    route: "/dashboard/image",
    price: "from $8",
    eta: "~5 min",
    detail: "Three options every time — pick the one you like.",
  },
  {
    id: "video",
    label: "Video",
    tagline: "Short avatar clips to full promos.",
    icon: Clapperboard,
    route: "/dashboard/video",
    price: "from $10",
    eta: "~10 min",
    detail: "Avatar-presented or pure motion, short or long.",
  },
  {
    id: "social",
    label: "Social Media",
    tagline: "Posts, profile kits & captions.",
    icon: Share2,
    route: "/dashboard/social",
    price: "from $18",
    eta: "~15 min",
    detail: "Post packs, profile kits, captions and GBP content.",
  },
  {
    id: "documents",
    label: "Business Documents",
    tagline: "Invoices, contracts, proposals.",
    icon: FileSignature,
    route: "/dashboard/documents",
    price: "from $10",
    eta: "~10 min",
    detail: "The paperwork you keep putting off, drafted properly.",
  },
  {
    id: "brand-kit",
    label: "Brand & Marketing Kit",
    tagline: "Identity, price lists, QR cards.",
    icon: Palette,
    route: "/dashboard/brand-kit",
    price: "from $10",
    eta: "~10 min",
    detail: "Style guides, letterheads, menus and QR cards.",
  },
];

export function getService(id: string): ServiceMeta {
  const service = services.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown service id: ${id}`);
  return service;
}
