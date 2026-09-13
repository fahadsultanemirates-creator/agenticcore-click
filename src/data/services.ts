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
};

// Final list — 7 services, each its own dedicated dashboard page.
export const services: ServiceMeta[] = [
  {
    id: "website",
    label: "Website",
    tagline: "A real site, live fast.",
    icon: Globe,
    route: "/dashboard/website",
  },
  {
    id: "pdf",
    label: "PDF & Documents",
    tagline: "Presentations, brochures, flyers & more.",
    icon: FileText,
    route: "/dashboard/pdf",
  },
  {
    id: "image",
    label: "Image",
    tagline: "Custom art, avatars & business visuals.",
    icon: Image,
    route: "/dashboard/image",
  },
  {
    id: "video",
    label: "Video",
    tagline: "Short avatar clips to full promos.",
    icon: Clapperboard,
    route: "/dashboard/video",
  },
  {
    id: "social",
    label: "Social Media",
    tagline: "Posts, profile kits & captions.",
    icon: Share2,
    route: "/dashboard/social",
  },
  {
    id: "documents",
    label: "Business Documents",
    tagline: "Invoices, contracts, proposals.",
    icon: FileSignature,
    route: "/dashboard/documents",
  },
  {
    id: "brand-kit",
    label: "Brand & Marketing Kit",
    tagline: "Identity, price lists, QR cards.",
    icon: Palette,
    route: "/dashboard/brand-kit",
  },
];

export function getService(id: string): ServiceMeta {
  const service = services.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown service id: ${id}`);
  return service;
}
