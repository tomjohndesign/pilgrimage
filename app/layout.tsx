import type { Metadata, Viewport } from 'next'
import { Cinzel, EB_Garamond } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
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
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
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
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
