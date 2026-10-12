export type WalletPackage = {
  id: string;
  price: string;
  firstTimeDiscount: number;
  routineDiscount: number;
  note?: string;
};

// Wallet top-up tiers. Not a credit system — every service keeps its own
// real price; the tier just sets the discount applied on top of it.
export const walletPackages: WalletPackage[] = [
  {
    id: "wallet-10",
    price: "$10",
    firstTimeDiscount: 15,
    routineDiscount: 0,
    note: "Minimum balance to start any service.",
  },
  {
    id: "wallet-30",
    price: "$30",
    firstTimeDiscount: 30,
    routineDiscount: 10,
  },
  {
    id: "wallet-100",
    price: "$100",
    firstTimeDiscount: 50,
    routineDiscount: 20,
  },
  {
    id: "wallet-200",
    price: "$200",
    firstTimeDiscount: 65,
    routineDiscount: 30,
  },
];

// The two wallet discounts are separate offers and never stack: the
// first-order one happens once, the routine one is standing. They used to
// be joined into one sentence by firstOrderDiscountLine(), which read
// "15% on $10, 30% on $30, ..." and left it genuinely unclear whether the
// percentage followed the TOP-UP or the ORDER. It follows the top-up.
// components/DiscountTable.tsx shows both columns instead.

export const flagshipPackage = {
  id: "full-business-setup",
  name: "Full Business Setup",
  price: "$20",
  tagline: "Get your business ready before your lunch or coffee gets finished.",
  contents: [
    "1 website (your choice of 1–4 or 5–10 pages)",
    "15 images of your choice for the business",
    "5 logo options to pick from",
    "3 picks from the PDF & Documents section",
    "3 short videos (10–15 sec, avatar or avatar-free)",
    "Social kit: 5 designs across each of 5 platforms",
    "1 pick from Business Documents",
    "1 pick from Brand & Marketing Kit",
  ],
};
