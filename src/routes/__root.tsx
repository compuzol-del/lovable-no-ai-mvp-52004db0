import { Outlet, Link, createRootRoute } from "@tanstack/react-router";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Whale Trading Bot — PolyMarket Dashboard" },
      { name: "description", content: "Automated paper & real trading bot that follows PolyMarket whale signals, with live P&L dashboards." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Whale Trading Bot — PolyMarket Dashboard" },
      { property: "og:description", content: "Automated paper & real trading bot that follows PolyMarket whale signals, with live P&L dashboards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Whale Trading Bot — PolyMarket Dashboard" },
      { name: "twitter:description", content: "Automated paper & real trading bot that follows PolyMarket whale signals, with live P&L dashboards." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f781db50-1ff5-4573-bcb5-3c3ec05768d9/id-preview-38e54fc8--0c9ec147-5140-4f7e-9ed7-09f536684152.lovable.app-1777534459563.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f781db50-1ff5-4573-bcb5-3c3ec05768d9/id-preview-38e54fc8--0c9ec147-5140-4f7e-9ed7-09f536684152.lovable.app-1777534459563.png" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return <Outlet />;
}
