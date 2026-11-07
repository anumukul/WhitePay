/** @type {import('next').NextConfig} */
export default {
  output: 'export',
  reactStrictMode: true,
  experimental: { cpus: 2 },
  images: { unoptimized: true },
};
