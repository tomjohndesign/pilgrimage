import type { Metadata, Viewport } from 'next'
import { Geist, UnifrakturCook } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { BalanceProvider } from '@/components/game/balance-provider'
import { ChromeProvider } from '@/components/chrome-provider'
import './globals.css'
import '@/components/chrome.css'

const geist = Geist({
  subsets: ["latin"],
  variable: '--font-geist',
  display: 'swap',
})

const unifrakturCook = UnifrakturCook({
  subsets: ["latin"],
  weight: '700',
  variable: '--font-unifraktur-cook',
  display: 'swap',
})

// Local dev tabs are named after the git branch (see next.config.mjs) so that
// several workspaces running side by side stay tellable apart in the tab strip.
const branch = process.env.NEXT_PUBLIC_GIT_BRANCH
const title: Metadata['title'] = branch
  ? { default: branch, template: branch }
  : 'Pilgrimage — A Medieval Settlement Builder'

/**
 * Manuscript branding: gold reliquary P on green for icons; green and gold
 * UnifrakturCook wordmark on canvas for sharing cards.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/E7H-1
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBK-0
 */
export const metadata: Metadata = {
  title,
  description: 'A medieval settlement builder inspired by RollerCoaster Tycoon & Age of Empires II. Begin with a holy relic and grow a pilgrimage site into a renowned destination.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  twitter: { card: 'summary_large_image' },
  icons: {
    icon: [
      { url: '/favicon.ico?v=manuscript', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg?v=manuscript', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: '/apple-icon.png?v=manuscript',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1a1208',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // The play page's resume script styles the root element before hydration
    // (see lib/game/save/view.ts), which React must not report as a mismatch.
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${unifrakturCook.variable}`}>
      <body className="font-sans antialiased">
        <ChromeProvider><BalanceProvider>{children}</BalanceProvider></ChromeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
