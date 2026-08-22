import { auth0 } from "@/lib/auth0";
import DashboardShell from "@/components/DashboardShell";
import TrackedItemsManager from "@/components/TrackedItemsManager";

const TrackedItemsPage = auth0.withPageAuthRequired(
  async function TrackedItemsPage() {
    const session = await auth0.getSession();
    const user = session?.user;

    if (!user?.sub) {
      return null;
    }

    return (
      <DashboardShell
        user={{ name: user.name, picture: user.picture }}
        active="tracked-items"
      >
        <div className="max-w-4xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Tracked Items</h2>
            <p className="text-sm text-gray-600">
              Add, review, and manage the products PricePulse is watching for
              you.
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
      </DashboardShell>
    );
  },
  { returnTo: "/tracked-items" },
);

export default TrackedItemsPage;
