/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dev overlay badge sits in the bottom-left corner, on top of the game HUD.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
