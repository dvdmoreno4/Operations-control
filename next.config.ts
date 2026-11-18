import type { NextConfig } from 'next';

const config: NextConfig = {
  // unpdf ships its own pdf.js build and loads it dynamically; keep it out of the server bundle.
  serverExternalPackages: ['unpdf'],
};

export default config;
