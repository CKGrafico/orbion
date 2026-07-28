import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { notFound } from 'next/navigation'
import { source } from '../../source'
import { isLocale } from '../../../i18n/routing'
import { OrbionMark } from '../../../components/landing/OrbionMark'

export default async function DocsLayoutWrapper({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) {
    notFound()
  }

  return (
    <DocsLayout
      tree={source.pageTree[locale]}
      githubUrl="https://github.com/PlainConceptsPlatform/orbion"
      nav={{
        title: (
          <span className="flex items-center gap-2">
            <OrbionMark className="h-6 w-6" />
            <span className="font-mono text-sm font-semibold">orbion</span>
          </span>
        ),
        enabled: true,
      }}
    >
      {children}
    </DocsLayout>
  )
}
