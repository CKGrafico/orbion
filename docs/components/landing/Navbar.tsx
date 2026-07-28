'use client'

import { useState } from 'react'
import { GithubLogoIcon, ListIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import { ThemeToggle } from 'fumadocs-ui/components/layout/theme-toggle'
import Link from 'next/link'
import { OrbionMark } from './OrbionMark'

export interface NavbarLabels {
  loopEngineering: string
  features: string
  docs: string
  getStarted: string
  github: string
  openMenu: string
  closeMenu: string
}

interface NavbarProps {
  labels: NavbarLabels
  docsHref: string
}

/**
 * Floating pill navigation, detached from the top edge. Collapses to a
 * full-screen staggered overlay on small viewports.
 */
export function Navbar({ labels, docsHref }: NavbarProps) {
  const [open, setOpen] = useState(false)

  const links = [
    { href: '#loop-engineering', label: labels.loopEngineering },
    { href: '#features', label: labels.features },
    { href: docsHref, label: labels.docs },
  ]

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <nav className="flex w-full max-w-2xl items-center justify-between gap-2 rounded-full border border-line-subtle bg-panel/80 py-2 pl-4 pr-2 backdrop-blur-xl">
          <a href="#top" className="flex items-center gap-2.5">
            <OrbionMark className="h-7 w-7" />
            <span className="font-mono text-sm font-semibold tracking-tight text-text">
              orbion
            </span>
          </a>

          <div className="flex items-center gap-1 max-sm:hidden">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3 py-1.5 text-sm text-text-sec transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-hover hover:text-text"
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/PlainConceptsPlatform/orbion"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={labels.github}
              className="rounded-full p-2 text-text-sec transition-colors duration-300 hover:bg-hover hover:text-text"
            >
              <GithubLogoIcon size={17} />
            </a>
            <ThemeToggle mode="light-dark" className="rounded-full border-0 bg-transparent p-2" />
            <Link
              href={`${docsHref}/quickstart`}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent-soft active:scale-[0.98]"
            >
              {labels.getStarted}
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={labels.openMenu}
            className="rounded-full p-2 text-text-sec transition-colors hover:bg-hover hover:text-text sm:hidden"
          >
            <ListIcon size={20} />
          </button>
        </nav>
      </header>

      {/* Mobile overlay with staggered link reveal */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-frame/90 backdrop-blur-2xl sm:hidden">
          <div className="flex items-center justify-between px-6 py-6">
            <span className="flex items-center gap-2.5">
              <OrbionMark className="h-7 w-7" />
              <span className="font-mono text-sm font-semibold text-text">
                orbion
              </span>
            </span>
            <span className="flex items-center gap-2">
              <ThemeToggle mode="light-dark" className="rounded-full border-0 bg-transparent p-2" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={labels.closeMenu}
                className="rounded-full border border-line-subtle p-2.5 text-text-sec transition-colors hover:text-text"
              >
                <XIcon size={20} />
              </button>
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-2 px-8">
            {links.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="animate-rise rounded-2xl px-4 py-4 text-3xl font-semibold tracking-tight text-text transition-colors hover:bg-hover"
                style={{ animationDelay: `${100 + i * 60}ms` }}
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/PlainConceptsPlatform/orbion"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="animate-rise rounded-2xl px-4 py-4 text-3xl font-semibold tracking-tight text-text transition-colors hover:bg-hover"
              style={{ animationDelay: `${100 + links.length * 60}ms` }}
            >
              GitHub
            </a>
            <Link
              href={`${docsHref}/quickstart`}
              onClick={() => setOpen(false)}
              className="animate-rise mt-6 rounded-full bg-accent px-6 py-4 text-center text-lg font-semibold text-accent-ink active:scale-[0.98]"
              style={{ animationDelay: '340ms' }}
            >
              {labels.getStarted}
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
