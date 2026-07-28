'use client'

import { useCallback, useState } from 'react'
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  GithubLogoIcon,
} from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'

export interface QuickstartLabels {
  heading: string
  intro: string
  outro: string
  ctaDocs: string
  ctaStar: string
  starAsk: string
  copy: string
  copied: string
}

const COMMANDS = [
  'git clone https://github.com/PlainConceptsPlatform/orbion',
  'cd orbion',
  'pnpm install',
  'pnpm dev',
]

export function Quickstart({ labels, docsHref }: { labels: QuickstartLabels; docsHref: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(COMMANDS.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [])

  return (
    <section className="border-t border-line-subtle">
      <div className="mx-auto max-w-2xl px-4 py-28 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {labels.heading}
        </h2>
        <p className="mt-4 text-text-sec">{labels.intro}</p>

        <div className="mt-10 rounded-[20px] border border-line-subtle bg-panel/70 p-1.5 text-left">
          <div className="rounded-[15px] border border-line bg-log">
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2">
              <span className="font-mono text-[10.5px] text-text-muted">shell</span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? labels.copied : labels.copy}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-mono text-[10.5px] text-text-muted transition-colors hover:border-accent hover:text-accent active:scale-[0.97]"
              >
                {copied ? <CheckIcon size={13} weight="bold" /> : <CopyIcon size={13} />}
                {copied ? labels.copied : labels.copy}
              </button>
            </div>
            <div className="flex flex-col gap-1 px-5 py-4 font-mono text-sm leading-relaxed">
              {COMMANDS.map((cmd) => (
                <div key={cmd}>
                  <span className="select-none text-text-muted">$ </span>
                  <span className="text-text">{cmd}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-5 text-sm text-text-muted">{labels.outro}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`${docsHref}/quickstart`}
            className="group inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 text-sm font-semibold text-accent-ink transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent-soft active:scale-[0.98]"
          >
            {labels.ctaDocs}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-ink/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:scale-105">
              <ArrowRightIcon size={15} weight="bold" />
            </span>
          </Link>
          <a
            href="https://github.com/PlainConceptsPlatform/orbion"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-6 py-2.5 text-sm font-medium text-text-sec transition-colors duration-500 hover:text-text active:scale-[0.98]"
          >
            <GithubLogoIcon size={16} />
            {labels.ctaStar}
          </a>
        </div>

        <p className="mt-6 text-xs text-text-muted">{labels.starAsk}</p>
      </div>
    </section>
  )
}
