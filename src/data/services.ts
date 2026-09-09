import {
  Clapperboard,
  CreditCard,
  FileText,
  Globe,
  Image,
  Shapes,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type Service = {
  id: string;
  label: string;
  tagline: string;
  icon: LucideIcon;
  eta: string;
  price: string;
  prompt: string;
  placeholder: string;
  chips: string[];
  comingSoon?: boolean;
};

export const services: Service[] = [
  {
    id: "website",
    label: "Website",
    tagline: "A real site, live by lunch.",
    icon: Globe,
    eta: "~20 min",
    price: "from $20",
    prompt: "What kind of website do you need?",
    placeholder: "e.g. A one-page site for my dog-walking business in Austin, warm and friendly vibe...",
    chips: ["Portfolio", "Local service business", "Online store", "Consulting site"],
  },
  {
    id: "logo",
    label: "Logo",
    tagline: "A mark worth putting on a truck.",
    icon: Shapes,
    eta: "~10 min",
    price: "from $12",
    prompt: "What's your business, and what's the vibe?",
    placeholder: "e.g. \"Pixel & Pine\" — a cozy woodworking studio. Playful but handmade-feeling...",
    chips: ["Minimal wordmark", "Bold icon + text", "Vintage badge", "Modern & geometric"],
  },
  {
    id: "image",
    label: "Image",
    tagline: "Custom art, zero stock-photo cringe.",
    icon: Image,
    eta: "~5 min",
    price: "from $8",
    prompt: "What image do you want us to create?",
    placeholder: "e.g. A cheerful flat-illustration hero image of a coffee cart for my homepage...",
    chips: ["Hero illustration", "Social post graphic", "Product mockup", "Icon set"],
  },
  {
    id: "video",
    label: "Video",
    tagline: "Short, punchy, done today.",
    icon: Clapperboard,
    eta: "~20 min",
    price: "from $25",
    prompt: "What's the video for?",
    placeholder: "e.g. A 15-second Instagram teaser announcing my bakery's grand opening...",
    chips: ["Social teaser", "Product demo", "Intro reel", "Ad spot"],
  },
  {
    id: "avatar",
    label: "Avatar",
    tagline: "You, but camera-ready.",
    icon: UserRound,
    eta: "~5 min",
    price: "from $6",
    prompt: "Tell us about the avatar you need.",
    placeholder: "e.g. A friendly, professional headshot-style avatar for LinkedIn, warm tones...",
    chips: ["Professional headshot", "Cartoon style", "Brand mascot", "Team set"],
  },
  {
    id: "brochure",
    label: "Business Brochure",
    tagline: "The PDF you actually hand out.",
    icon: FileText,
    eta: "~15 min",
    price: "from $15",
    prompt: "What should the brochure cover?",
    placeholder: "e.g. A tri-fold brochure for my landscaping business — services, pricing, contact...",
    chips: ["Tri-fold", "One-pager", "Service menu", "Price sheet"],
  },
  {
    id: "business-card",
    label: "Business Card",
    tagline: "First impressions, printed.",
    icon: CreditCard,
    eta: "~5 min",
    price: "from $8",
    prompt: "What should the card say and feel like?",
    placeholder: "e.g. Clean, modern card for a freelance photographer — name, phone, Instagram...",
    chips: ["Minimal", "Bold color block", "Classic & elegant", "Playful"],
  },
  {
    id: "more",
    label: "More soon",
    tagline: "Social kits, email templates & more.",
    icon: Sparkles,
    eta: "—",
    price: "—",
    prompt: "",
    placeholder: "",
    chips: [],
    comingSoon: true,
  },
];
