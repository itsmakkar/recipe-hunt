import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "mammoth", "@google/genai"],
};

export default nextConfig;
