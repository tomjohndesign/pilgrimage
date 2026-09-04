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
}

export default nextConfig
