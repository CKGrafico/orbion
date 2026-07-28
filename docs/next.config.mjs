import { createMDX } from 'fumadocs-mdx/next'
import createNextIntlPlugin from 'next-intl/plugin'

const withMDX = createMDX()
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Served from https://plainconceptsplatform.github.io/orbion/ (GitHub Pages
// project site). Set to '' if the site ever moves back to its own domain.
const basePath = '/orbion'

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  basePath,
  // next/link and next/image prefix basePath automatically; this exposes it to
  // the few places that build URLs by hand (the root locale redirect).
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
}

export default withNextIntl(withMDX(config))
