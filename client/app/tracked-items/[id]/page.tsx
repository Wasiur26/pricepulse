import { auth0 } from "@/lib/auth0";
import DashboardShell from "@/components/DashboardShell";
import TrackedItemDetail from "@/components/TrackedItemDetail";

const TrackedItemPage = auth0.withPageAuthRequired(
  async function TrackedItemPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;
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
            <h2 className="text-2xl font-bold tracking-tight">Item Details</h2>
            <p className="text-sm text-gray-600">
              Price history and tracking details for this product.
            </p>
          </div>
          <TrackedItemDetail
            itemId={id}
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
  {
    returnTo: async ({ params }) => {
      const { id } = await params;
      return `/tracked-items/${id}`;
    },
  },
);

export default TrackedItemPage;
