import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const SRC_DIR = join(process.cwd(), 'src')
const THRESHOLD = 10

interface FileResult {
  path: string
  ratio: number
  commentLines: number
  nonBlankLines: number
}

function findSourceFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath))
    } else if (entry.isFile()) {
      const ext = extname(entry.name)
      if (ext === '.ts' || ext === '.tsx') {
        // Skip test files
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue
        results.push(fullPath)
      }
    }
  }
  return results
}

function countComments(content: string): FileResult & { raw: string } {
  const lines = content.split('\n')
  let commentLines = 0
  let nonBlankLines = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    nonBlankLines++

    // A line is a comment if it starts with //, /*, */, or * (JSDoc inner)
    if (/^(\/\/|\/\*|\*\/|\*\s)/.test(trimmed)) {
      commentLines++
    }
  }

  return { path: '', ratio: 0, commentLines, nonBlankLines, raw: '' }
}

function main(): void {
  const files = findSourceFiles(SRC_DIR)
  const results: FileResult[] = []

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8')
    const result = countComments(content)
    if (result.nonBlankLines === 0) continue
    result.ratio = (result.commentLines / result.nonBlankLines) * 100
    result.path = relative(process.cwd(), filePath)
    if (result.ratio > THRESHOLD) {
      results.push(result)
    }
  }

  if (results.length === 0) {
    console.log(`✅ All files pass: comment ratio ≤ ${THRESHOLD}%`)
    process.exit(0)
  }

  results.sort((a, b) => b.ratio - a.ratio)
  console.log(`\n❌ ${results.length} file(s) exceed ${THRESHOLD}% comment ratio:\n`)
  for (const r of results) {
    console.log(`  ${r.ratio.toFixed(1)}% (${r.commentLines}/${r.nonBlankLines}) ${r.path}`)
  }
  process.exit(1)
}

main()
