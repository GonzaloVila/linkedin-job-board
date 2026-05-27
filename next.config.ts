import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read cv.md at build time so it's available in the Vercel serverless bundle.
// process.env.CV_CONTENT is only used on the server (server actions).
let cvContent = '';
try {
  cvContent = readFileSync(join(process.cwd(), 'src/lib/cv.md'), 'utf-8');
} catch {
  // Will be empty if the file doesn't exist at build time
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    CV_CONTENT: cvContent,
  },
};

export default nextConfig;
