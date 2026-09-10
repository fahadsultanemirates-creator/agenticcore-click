export type Plan = {
  id: string;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  highlighted?: boolean;
};

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$10",
    cadence: "/month",
    blurb: "For getting the basics live.",
    features: ["2 services / month", "2 free revisions each", "Email support"],
    highlighted: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29",
    cadence: "/month",
    blurb: "For businesses shipping regularly.",
    features: ["6 services / month", "2 free revisions each", "Priority queue"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$59",
    cadence: "/month",
    blurb: "For teams that need volume.",
    features: ["15 services / month", "3 free revisions each", "Priority queue", "Dedicated Forge threads"],
  },
  {
    id: "scale",
    name: "Scale",
    price: "$99",
    cadence: "/month",
    blurb: "For agencies managing multiple brands.",
    features: ["Unlimited services", "3 free revisions each", "Priority queue", "Multi-brand workspaces"],
  },
];
