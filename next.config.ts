import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sequelize loads its dialect (pg, pg-hstore) with dynamic requires, which bundlers can't follow.
  serverExternalPackages: ["sequelize", "pg", "pg-hstore"],
};

export default nextConfig;
