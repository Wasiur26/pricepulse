import type { UserContext } from "@/lib/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export function userHeaders(user: UserContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-user-sub": user.sub,
    ...(user.name ? { "x-user-name": user.name } : {}),
    ...(user.email ? { "x-user-email": user.email } : {}),
    ...(user.picture ? { "x-user-picture": user.picture } : {}),
  };
}
