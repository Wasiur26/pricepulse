export default function Home() {
  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900 bg-gray-50">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 shadow-md shadow-indigo-200"></div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            PricePulse
          </h1>
        </div>
        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-600">
          <a href="#" className="hover:text-gray-900 transition-colors">
            Features
          </a>
          <a href="#" className="hover:text-gray-900 transition-colors">
            How It Works
          </a>
          <a href="#" className="hover:text-gray-900 transition-colors">
            Pricing
          </a>
        </nav>
        <div className="flex items-center space-x-3">
          <a
            href="#"
            className="hidden sm:block px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Sign In
          </a>
          <a
            href="#"
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Get Started Free
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-purple-50 to-gray-50">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_60%)]"></div>
          <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-sm font-medium text-indigo-700 bg-indigo-100/70 border border-indigo-200 rounded-full">
              <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></span>
              Track prices across all your favorite stores
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-tight">
              Never miss a{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                price drop
              </span>{" "}
              again
            </h2>
            <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
              Paste any product link and PricePulse will watch it for you. Get
              instant alerts the moment the price hits your target, so you always
              buy at the right time.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#"
                className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg shadow-indigo-300 hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                Start Tracking Free
              </a>
              <a
                href="#"
                className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-gray-900 bg-white border-2 border-gray-300 rounded-xl hover:border-indigo-500 hover:text-indigo-600 transition-all"
              >
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="border-y border-gray-200 bg-white">
          <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              ["2.4M+", "Products tracked"],
              ["38M+", "Price drops caught"],
              ["1.2M+", "Alerts delivered"],
              ["120+", "Stores supported"],
            ].map(([stat, label]) => (
              <div key={label}>
                <p className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {stat}
                </p>
                <p className="mt-1 text-sm text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                Features
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Everything you need to save money
              </h2>
              <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
                Powerful tracking tools designed to help you shop smarter and
                never overpay again.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  title: "Price Drop Alerts",
                  desc: "Set your target price and get notified instantly via email or push notification when it hits.",
                  icon: (
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  ),
                },
                {
                  title: "Price History",
                  desc: "See full price trends for any product before you buy, so you know when a deal is real.",
                  icon: (
                    <path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2 2H5V5h14v14zM3 21h18v-2H3v2zm16-18H5C3.9 3 3 3.9 3 5v16h18V5c0-1.1-.9-2-2-2z" />
                  ),
                },
                {
                  title: "Multiple Stores",
                  desc: "Track the same product across 120+ retailers and always buy from the cheapest source.",
                  icon: (
                    <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
                  ),
                },
                {
                  title: "Restock Alerts",
                  desc: "Sold out? We'll watch the page and alert you the moment it's back in stock.",
                  icon: (
                    <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z" />
                  ),
                },
                {
                  title: "Smart Watchlist",
                  desc: "Organize tracked items into lists and keep an eye on all your wishlist items in one place.",
                  icon: (
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  ),
                },
                {
                  title: "Free Forever",
                  desc: "Start tracking prices today with our generous free plan. No credit card required.",
                  icon: (
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  ),
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:border-indigo-200 hover:-translate-y-1 transition-all"
                >
                  <div className="w-12 h-12 mb-5 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center group-hover:from-indigo-600 group-hover:to-purple-600 transition-colors">
                    <svg
                      className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-20 bg-white border-t border-gray-200">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                How It Works
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Start saving in three simple steps
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-10">
              {[
                [
                  "01",
                  "Paste a product link",
                  "Copy any product URL from a supported store and drop it into PricePulse.",
                ],
                [
                  "02",
                  "Set your target price",
                  "Tell us the price you want to pay. It's completely optional to get started.",
                ],
                [
                  "03",
                  "Get alerted & save",
                  "Sit back and relax. We'll notify you the moment your target price is reached.",
                ],
              ].map(([num, title, desc]) => (
                <div key={num} className="text-center">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-bold text-lg flex items-center justify-center shadow-lg shadow-indigo-200">
                    {num}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed max-w-xs mx-auto">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden py-20 bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.15),transparent_60%)]"></div>
          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Ready to start saving money?
            </h2>
            <p className="mt-4 text-lg text-indigo-100">
              Join thousands of smart shoppers who never pay full price. It takes
              less than a minute to set up.
            </p>
            <a
              href="#"
              className="mt-8 inline-block px-10 py-4 text-base font-semibold text-indigo-700 bg-white rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
            >
              Get Started Free
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600"></div>
            <span className="font-bold">PricePulse</span>
          </div>
          <nav className="flex items-center space-x-6 text-sm text-gray-600">
            <a href="#" className="hover:text-gray-900 transition-colors">
              Features
            </a>
            <a href="#" className="hover:text-gray-900 transition-colors">
              Pricing
            </a>
            <a href="#" className="hover:text-gray-900 transition-colors">
              Blog
            </a>
            <a href="#" className="hover:text-gray-900 transition-colors">
              Support
            </a>
          </nav>
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} PricePulse. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
