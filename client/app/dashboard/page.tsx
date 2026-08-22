import Link from "next/link";
import { auth0 } from "@/lib/auth0";
import DashboardShell from "@/components/DashboardShell";
import DashboardOverview from "@/components/DashboardOverview";

const DashboardPage = auth0.withPageAuthRequired(
  async function DashboardPage() {
    const session = await auth0.getSession();
    const user = session?.user;

    if (!user?.sub) {
      return null;
    }

    return (
      <DashboardShell
        user={{ name: user.name, picture: user.picture }}
        active="dashboard"
      >
        <div className="max-w-5xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Welcome back, {user?.name?.split(" ")[0] ?? "shopper"}
              </h2>
              <p className="text-sm text-gray-600">
                Here&apos;s how the products you&apos;re watching are doing.
              </p>
            </div>
            <Link
              href="/tracked-items"
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              Manage Tracked Items
            </Link>
          </div>
          <DashboardOverview
            user={{
              sub: user.sub,
              name: user.name,
              email: user.email,
              picture: user.picture,
            }}
          />
        </div>
      </DashboardShell>
    );
  },
  { returnTo: "/dashboard" },
);

export default DashboardPage;
