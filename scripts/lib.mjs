// 公共工具：index.mjs / check.mjs 共用。零依赖，Node >= 18。
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = process.cwd()
export const SKIP_DIRS = new Set(['.git', '.template', 'scripts', 'docs', 'node_modules'])

/**
 * 分类目录名 → 展示中文名。数组顺序即 README 展示顺序，新增分类在此追加即可。
 */
export const CATEGORY_MAP = [
  { dir: 'programming', label: '程序' },
  { dir: 'history', label: '历史' },
  { dir: 'economics', label: '经济' },
  { dir: 'psychology', label: '心理' },
  { dir: 'yi', label: '易' },
  { dir: 'literature', label: '文学' },
  { dir: 'zhuzi', label: '诸子' },
  { dir: 'others', label: '杂学' },
]

/** 分类目录名 → 中文名；未登记的分类原样返回。 */
export const categoryLabel = (dir) => CATEGORY_MAP.find((c) => c.dir === dir)?.label ?? dir

/** 分类展示序号；未登记的分类排最后（按字母序）。 */
export const categoryRank = (dir) => {
  const i = CATEGORY_MAP.findIndex((c) => c.dir === dir)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/**
 * 阅读状态（记在笔记导航页 frontmatter）：reading 在读 | readed 读完。
 * 其他值或为空一律视为「未读」，勿再引入第三个值。
 */
export const READ_STATUS = { READING: 'reading', READED: 'readed' }

/** 从笔记导航页 frontmatter 解析阅读状态；非 reading/readed 返回 null（未读）。 */
export const readStatusOf = (fm) =>
  fm?.status === READ_STATUS.READING || fm?.status === READ_STATUS.READED ? fm.status : null

/**
 * 书单总状态 = 清单书籍阅读状态的汇总（书单 README 不再手填 status）：
 *  - 全部书籍读完（有笔记导航页且均为 readed）→ readed
 *  - 否则有任一本在读（reading）→ reading
 *  - 其余 → null（未读）
 */
export function booklistStatus(listPath) {
  const titles = [...bookListTitles(readFileSync(join(listPath, 'README.md'), 'utf8'))]
  if (!titles.length) return null
  let anyReading = false
  let anyUnmarked = false // 缺笔记导航页，或导航页未标状态
  for (const t of titles) {
    const nav = join(listPath, 'notes', t, 'README.md')
    if (!existsSync(nav)) { anyUnmarked = true; continue }
    const s = readStatusOf(parseFrontmatter(nav))
    if (s === READ_STATUS.READING) anyReading = true
    else if (!s) anyUnmarked = true
  }
  if (!anyUnmarked) return READ_STATUS.READED
  return anyReading ? READ_STATUS.READING : null
}

/** 状态值 → 中文标签（未读 / 在读 / 已读）。 */
export const statusLabel = (s) =>
  s === READ_STATUS.READING ? '在读' : s === READ_STATUS.READED ? '已读' : '未读'

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