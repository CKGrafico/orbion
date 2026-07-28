import { defaultLocale } from '../i18n/routing'

// Static export has no server redirects: this shell forwards / to the
// default locale immediately via an inline script, with a plain link as
// the no-JS fallback.
//
// Both targets are built by hand, so they need the GitHub Pages basePath
// prefix that next/link would otherwise add for us.
export default function RootRedirect() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  const target = `${basePath}/${defaultLocale}/`

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-frame text-text">
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(target)})`,
        }}
      />
      <a href={target} className="font-mono text-sm text-text-sec underline underline-offset-4">
        Continue to Orbion
      </a>
    </main>
  )
}
