import Link from 'next/link'
import { OrbionMark } from './OrbionMark'

export interface FooterLabels {
  line: string
  docs: string
  github: string
  loopTask: string
}

export function Footer({ labels, docsHref }: { labels: FooterLabels; docsHref: string }) {
  return (
    <footer className="border-t border-line-subtle">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-9 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <OrbionMark className="h-6 w-6" />
          <p className="text-xs text-text-muted">{labels.line}</p>
        </div>

        <nav className="flex items-center gap-5 text-xs text-text-sec">
          <Link href={docsHref} className="transition-colors hover:text-text">
            {labels.docs}
          </Link>
          <a
            href="https://github.com/PlainConceptsPlatform/orbion"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-text"
          >
            {labels.github}
          </a>
          <a
            href="https://github.com/PlainConceptsPlatform/loop-task"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-text"
          >
            {labels.loopTask}
          </a>
        </nav>
      </div>
    </footer>
  )
}
