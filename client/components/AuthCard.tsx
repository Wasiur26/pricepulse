import Link from "next/link";
import EmailAuthForm from "./EmailAuthForm";

export default function AuthCard({
  mode,
  heading,
  subtext,
  switchHref,
  switchText,
  switchPrompt,
}: {
  mode: "login" | "signup";
  heading: string;
  subtext: string;
  switchHref: string;
  switchText: string;
  switchPrompt: string;
}) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-12 font-sans text-gray-900 bg-gradient-to-b from-indigo-50 via-purple-50 to-gray-50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_60%)]"></div>

      <Link href="/" className="relative flex items-center space-x-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 shadow-md shadow-indigo-200"></div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          PricePulse
        </h1>
      </Link>

      <div className="relative w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl shadow-indigo-100 p-8">
        <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>
        <p className="mt-2 text-sm text-gray-600 mb-6">{subtext}</p>

        <EmailAuthForm mode={mode} />

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 border-t border-gray-200"></div>
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            or
          </span>
          <div className="flex-1 border-t border-gray-200"></div>
        </div>

        <p className="text-center text-sm text-gray-600">
          {switchPrompt}{" "}
          <Link
            href={switchHref}
            className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {switchText}
          </Link>
        </p>
      </div>

      <p className="relative mt-8 text-xs text-gray-400">
        © {new Date().getFullYear()} PricePulse. All rights reserved.
      </p>
    </div>
  );
}
