export type UserContext = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

export type TrackedItem = {
  id: string;
  name: string;
  url: string;
  image: string | null;
  platform: string | null;
  targetPrice: number | null;
  currency: string;
  active: boolean;
  lastPrice: number | null;
  lastStatus: "pending" | "success" | "error" | "skipped";
  lastCheckedAt: string | null;
  nextCheckAt: string;
  createdAt: string;
};
