import type { Metadata, Viewport } from 'next'
import { Cinzel, EB_Garamond } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { BalanceProvider } from '@/components/game/balance-provider'
import './globals.css'

const cinzel = Cinzel({ 
  subsets: ["latin"],
  variable: '--font-cinzel',
  display: 'swap',
})

const ebGaramond = EB_Garamond({ 
  subsets: ["latin"],
  variable: '--font-garamond',
  display: 'swap',
})

// Site iconography (favicon, Apple/PWA icons, Open Graph card) is the "logo"
// mark from Paper: a parchment Cinzel Black "P" on the forest green.
// @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/G3-0
//
// Local dev tabs are named after the git branch (see next.config.mjs) so that
// several workspaces running side by side stay tellable apart in the tab strip.
const branch = process.env.NEXT_PUBLIC_GIT_BRANCH
const title: Metadata['title'] = branch
  ? { default: branch, template: branch }
  : 'Pilgrimage — A Medieval Settlement Builder'

export const metadata: Metadata = {
  title,
  description: 'A medieval settlement builder inspired by RollerCoaster Tycoon & Age of Empires II. Begin with a holy relic and grow a pilgrimage site into a renowned destination.',
  generator: 'v0.app',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1a1208',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${ebGaramond.variable} bg-[#1a1208]`}>
      <body className="font-serif antialiased">
        <BalanceProvider>{children}</BalanceProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
