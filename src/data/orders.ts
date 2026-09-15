export type OrderStatus = "delivered" | "in_progress" | "draft";

export type Order = {
  id: string;
  publicId: string;
  serviceId: string;
  summary: string;
  requestedAt: string;
  status: OrderStatus;
};

const TASK_ID_PREFIX = "AC-CLICK";

export const orders: Order[] = [
  {
    id: "ord-1",
    publicId: `${TASK_ID_PREFIX}-0001`,
    serviceId: "brand-kit",
    summary: "Business name + tagline options",
    requestedAt: "2026-08-14",
    status: "delivered",
  },
  {
    id: "ord-2",
    publicId: `${TASK_ID_PREFIX}-0002`,
    serviceId: "documents",
    summary: "Invoice template, branded",
    requestedAt: "2026-08-19",
    status: "delivered",
  },
  {
    id: "ord-3",
    publicId: `${TASK_ID_PREFIX}-0003`,
    serviceId: "pdf",
    summary: "Tri-fold brochure — services + pricing",
    requestedAt: "2026-08-27",
    status: "delivered",
  },
  {
    id: "ord-4",
    publicId: `${TASK_ID_PREFIX}-0004`,
    serviceId: "image",
    summary: "Hero illustration for homepage",
    requestedAt: "2026-09-02",
    status: "in_progress",
  },
  {
    id: "ord-5",
    publicId: `${TASK_ID_PREFIX}-0005`,
    serviceId: "social",
    summary: "Launch week post pack",
    requestedAt: "2026-09-06",
    status: "in_progress",
  },
  {
    id: "ord-6",
    publicId: `${TASK_ID_PREFIX}-0006`,
    serviceId: "website",
    summary: "Homepage draft — awaiting brief",
    requestedAt: "2026-09-09",
    status: "draft",
  },
];
