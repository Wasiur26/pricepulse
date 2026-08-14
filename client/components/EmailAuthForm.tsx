"use client";

import { useState } from "react";

export default function EmailAuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const isSignup = mode === "signup";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      event.preventDefault();
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
  }

  return (
    <form
      action="/auth/login"
      method="get"
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="login_hint" value={email} />
      {isSignup && <input type="hidden" name="screen_hint" value="signup" />}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-semibold text-gray-900 mb-1.5"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        {isSignup ? "Create Account" : "Continue"}
      </button>

      <p className="text-xs text-gray-500 text-center leading-relaxed">
        You&apos;ll finish {isSignup ? "signing up" : "logging in"} on Auth0&apos;s
        secure page, where you can also sign in with Google or Apple.
      </p>
    </form>
  );
}
