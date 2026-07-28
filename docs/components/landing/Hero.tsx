import { ArrowRightIcon, GithubLogoIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { OrbitDiagram } from './OrbitDiagram'

export interface HeroLabels {
  eyebrow: string
  headline1: string
  headline2: string
  subtext: string
  ctaPrimary: string
  ctaSecondary: string
}

export function Hero({ labels, docsHref }: { labels: HeroLabels; docsHref: string }) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid min-h-[100dvh] max-w-7xl items-center gap-8 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-12 lg:gap-4">
        <div className="flex flex-col items-start lg:col-span-5">
          <p
            className="animate-rise inline-flex items-center rounded-full border border-line-subtle bg-panel/80 px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-sec"
          >
            {labels.eyebrow}
          </p>

          <h1
            className="animate-rise mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            style={{ animationDelay: '80ms' }}
          >
            {labels.headline1}
            <br />
            <span className="text-accent">{labels.headline2}</span>
          </h1>

          <p
            className="animate-rise mt-6 max-w-md text-lg leading-relaxed text-text-sec"
            style={{ animationDelay: '160ms' }}
          >
            {labels.subtext}
          </p>

          <div
            className="animate-rise mt-10 flex flex-wrap items-center gap-3"
            style={{ animationDelay: '240ms' }}
          >
            <Link
              href={`${docsHref}/quickstart`}
              className="group inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 text-sm font-semibold text-accent-ink transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent-soft active:scale-[0.98]"
            >
              {labels.ctaPrimary}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-ink/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:scale-105">
                <ArrowRightIcon size={15} weight="bold" />
              </span>
            </Link>
            <a
              href="https://github.com/PlainConceptsPlatform/orbion"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-2.5 text-sm font-medium text-text-sec transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-text active:scale-[0.98]"
            >
              <GithubLogoIcon size={16} />
              {labels.ctaSecondary}
            </a>
          </div>
        </div>

        <div
          className="animate-rise lg:col-span-7"
          style={{ animationDelay: '300ms' }}
        >
          <OrbitDiagram />
        </div>
      </div>
    </section>
  )
}
