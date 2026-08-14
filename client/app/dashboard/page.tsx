import Image from "next/image";
import Link from "next/link";
import { auth0 } from "@/lib/auth0";
import TrackedItemsManager from "./TrackedItemsManager";

const DashboardPage = auth0.withPageAuthRequired(
  async function DashboardPage() {
    const session = await auth0.getSession();
    const user = session?.user;

    if (!user?.sub) {
      return null;
    }

    return (
      <div className="min-h-screen flex flex-col font-sans text-gray-900 bg-gray-50">
        <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 shadow-md shadow-indigo-200"></div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                PricePulse
              </h1>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              {user?.picture ? (
                <Image
                  src={user.picture}
                  alt={user.name ?? "User avatar"}
                  width={36}
                  height={36}
                  className="rounded-full border-2 border-gray-200"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </span>
                </div>
              )}
              <span className="hidden sm:block text-sm font-semibold text-gray-800">
                {user?.name}
              </span>
            </div>
            <a
              href="/auth/logout"
              className="px-4 py-2 text-sm font-semibold text-gray-700 border-2 border-gray-300 rounded-lg hover:border-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign Out
            </a>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-56 bg-white border-r border-gray-200 py-6 flex-shrink-0">
            <nav className="flex flex-col space-y-1 px-3">
              <Link
                href="/dashboard"
                className="px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-3 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Tracked Items
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-3 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Price Alerts
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-3 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Price History
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-3 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Watchlist
              </Link>
            </nav>
          </aside>

          <main className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-3xl">
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight">
                  Welcome back, {user?.name?.split(" ")[0] ?? "shopper"}
                </h2>
                <p className="text-sm text-gray-600">
                  Manage the products you&apos;re tracking below.
                </p>
              </div>
              <TrackedItemsManager
                user={{
                  sub: user.sub,
                  name: user.name,
                  email: user.email,
                  picture: user.picture,
                }}
              />
            </div>
          </main>
        </div>
      </div>
    );
  },
  { returnTo: "/dashboard" },
);

export default DashboardPage;
