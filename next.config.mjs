import { execSync } from 'node:child_process'

/**
 * Local dev tabs are named after the git branch, so several workspaces running
 * side by side stay tellable apart. Resolved once, when the dev server boots.
 */
function gitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dev overlay badge sits in the bottom-left corner, on top of the game HUD.
  devIndicators: false,
  env: {
    NEXT_PUBLIC_GIT_BRANCH:
      process.env.NODE_ENV === 'development' ? gitBranch() : '',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{
      source: '/:path*',
      // Background music uses a hidden YouTube video. Prevent the embed from
      // opening a floating video player when the user switches tabs.
      headers: [{ key: 'Permissions-Policy', value: 'picture-in-picture=()' }],
    }]
  },
  async redirects() {
    // The texture gallery moved under /assets when characters joined it.
    return [{ source: '/textures', destination: '/assets/textures', permanent: true }]
  },
}

export default nextConfig
