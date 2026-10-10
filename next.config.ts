import type { NextConfig } from "next";

// Balance reads live ledger state on every request, so we use the classic
// dynamic rendering model rather than Cache Components.
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
