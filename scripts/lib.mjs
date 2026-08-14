// 公共工具：index.mjs / check.mjs 共用。零依赖，Node >= 18。
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = process.cwd()
export const SKIP_DIRS = new Set(['.git', '.template', 'scripts', 'docs', 'node_modules'])

/** 解析文件头部 `---` 包裹的 YAML frontmatter（仅简单键值，足够本项目使用）。 */
export function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return fm
}

/** 列出所有书单：分类目录下含 README.md 的直接子目录。 */
export function listBooklists() {
  const lists = []
  for (const cat of readdirSync(ROOT).sort()) {
    if (SKIP_DIRS.has(cat) || cat.startsWith('.')) continue
    const catPath = join(ROOT, cat)
    if (!statSync(catPath).isDirectory()) continue
    for (const name of readdirSync(catPath)) {
      const listPath = join(catPath, name)
      if (!statSync(listPath).isDirectory()) continue
      if (existsSync(join(listPath, 'README.md'))) lists.push({ cat, name, path: listPath })
    }
  }
  return lists
}

export const countBooks = (listPath) =>
  existsSync(join(listPath, 'books'))
    ? readdirSync(join(listPath, 'books')).filter((f) => f.endsWith('.md')).length
    : 0

export const countNotes = (listPath) =>
  existsSync(join(listPath, 'notes'))
    ? readdirSync(join(listPath, 'notes')).filter((d) => statSync(join(listPath, 'notes', d)).isDirectory()).length
    : 0

/** 把 markdown 文本解析为表格数组，每个表格是一组连续的 `|` 行。 */
export function parseTables(text) {
  const tables = []
  let cur = null
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) {
      if (!cur) cur = []
      cur.push(line.trim())
    } else if (cur) {
      tables.push(cur)
      cur = null
    }
  }
  if (cur) tables.push(cur)
  return tables
}

/** 从「书目清单」表格提取《书名》：只认表头含「书籍」的表，忽略其他表格（如「怎么读」阶段表）。 */
export function bookListTitles(readmeText) {
  const titles = new Set()
  for (const table of parseTables(readmeText)) {
    const header = table[0] ?? ''
    if (!header.includes('书籍')) continue
    for (const row of table.slice(2)) {
      for (const m of row.matchAll(/《([^》]+)》/g)) titles.add(m[1])
    }
  }
  return titles
}

export const OK = (msg) => console.log(`  ✔ ${msg}`)
export const WARN = (msg) => console.log(`  ⚠️  ${msg}`)
export const ERR = (msg) => console.log(`  ❌ ${msg}`)