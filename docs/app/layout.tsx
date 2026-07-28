import type { Metadata } from 'next'
import { Geist_Mono, Outfit } from 'next/font/google'
import './global.css'

/* Outfit is the Platform Foundations typeface; it feeds --font-sans, which the
   ui-theme base layer applies to <body>. Mono stays Geist for code and logs. */
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://plainconceptsplatform.github.io/orbion'),
  title: {
    default: 'Orbion: the open-source control plane for Loop Engineering',
    template: '%s | Orbion',
  },
  description:
    'Every loop, every machine, one window. Orbion watches the loop-task daemons on your fleet: status, live logs, and AI agents.',
  openGraph: {
    siteName: 'Orbion',
    type: 'website',
    images: ['/og.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
