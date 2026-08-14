import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import AuthCard from "@/components/AuthCard";

export default async function SignupPage() {
  const session = await auth0.getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthCard
      mode="signup"
      heading="Create your account"
      subtext="Enter your email to get started with PricePulse for free."
      switchPrompt="Already have an account?"
      switchText="Log in"
      switchHref="/login"
    />
  );
}
