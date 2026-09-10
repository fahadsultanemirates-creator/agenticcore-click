export type OrderStatus = "delivered" | "in_progress" | "draft";

export type Order = {
  id: string;
  serviceId: string;
  summary: string;
  requestedAt: string;
  status: OrderStatus;
};

export const orders: Order[] = [
  {
    id: "ord-1",
    serviceId: "logo",
    summary: "Minimal wordmark, warm palette",
    requestedAt: "2026-08-14",
    status: "delivered",
  },
  {
    id: "ord-2",
    serviceId: "business-card",
    summary: "Clean card, phone + Instagram",
    requestedAt: "2026-08-19",
    status: "delivered",
  },
  {
    id: "ord-3",
    serviceId: "brochure",
    summary: "Tri-fold, services + pricing",
    requestedAt: "2026-08-27",
    status: "delivered",
  },
  {
    id: "ord-4",
    serviceId: "image",
    summary: "Hero illustration for homepage",
    requestedAt: "2026-09-02",
    status: "in_progress",
  },
  {
    id: "ord-5",
    serviceId: "social-kit",
    summary: "Launch week content pack",
    requestedAt: "2026-09-06",
    status: "in_progress",
  },
  {
    id: "ord-6",
    serviceId: "website",
    summary: "Homepage draft — awaiting brief",
    requestedAt: "2026-09-09",
    status: "draft",
  },
];
