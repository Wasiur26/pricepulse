import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import AuthCard from "@/components/AuthCard";

export default async function LoginPage() {
  const session = await auth0.getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthCard
      mode="login"
      heading="Welcome back"
      subtext="Enter your email to log in to your PricePulse account."
      switchPrompt="New to PricePulse?"
      switchText="Create an account"
      switchHref="/signup"
    />
  );
}
