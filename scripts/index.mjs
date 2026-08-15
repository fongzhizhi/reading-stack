// 索引：聚合所有书单，更新根 README 的「书单一览」与「读书记录」两个占位区。
// 用法：node scripts/index.mjs
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, listBooklists, parseFrontmatter, countBooks, countNotes, bookListTitles, categoryLabel, categoryRank, booklistStatus, readStatusOf, statusLabel, OK, WARN } from './lib.mjs'

const README_FILE = join(ROOT, 'README.md')
const banner = (name) => `<!-- ${name}:START -->`
const footer = (name) => `<!-- ${name}:END -->`
const region = (name, body) => `${banner(name)}\n\n${body}\n\n${footer(name)}` // 注释与表格之间留空行，防注释被吞进表格

/** 相对根目录的路径，用正斜杠（markdown 链接用）。 */
const rel = (l, ...rest) => [l.cat, l.name, ...rest].join('/')
const link = (path) => encodeURI(path) // 中文文件名必须编码，否则 GitHub 上部分客户端会断链

/** 书单一览：按分类分组，每组一张表（分类无书单不建表）。分类顺序按 CATEGORY_MAP（未登记的排最后），分类内按 updated 降序（最近活动的在前），缺 updated 用 created，再缺省按目录名。 */
function buildBooklist(lists) {
  const byCat = new Map()
  for (const l of lists) {
    if (!byCat.has(l.cat)) byCat.set(l.cat, [])
    byCat.get(l.cat).push(l)
  }
  const blocks = []
  for (const cat of [...byCat.keys()].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))) {
    const group = byCat.get(cat)
    const active = (l) => {
      const fm = parseFrontmatter(join(l.path, 'README.md')) ?? {}
      return fm.updated || fm.created || '' // 最近活动日优先，其次创建日
    }
    group.sort((a, b) => {
      const ka = active(a)
      const kb = active(b)
      if (ka && kb) return kb.localeCompare(ka) // 新日期在前
      if (ka) return -1
      if (kb) return 1
      return a.name.localeCompare(b.name)
    })
    const rows = group.map((l) => {
      // 状态由清单书籍的阅读状态汇总：全部读完→已读；有在读→在读；否则未读
      return `| [${l.name}](${link(rel(l, 'README.md'))}) | ${statusLabel(booklistStatus(l.path))} | ${countBooks(l.path)} | ${countNotes(l.path)} |`
    })
    rows.unshift('| 书单 | 状态 | 书籍 | 笔记 |', '| :--- | :--- | ---: | ---: |')
    blocks.push(`### ${categoryLabel(cat)}\n\n${rows.join('\n')}`)
  }
  return blocks.join('\n\n')
}

/**
 * 读书记录：三张表（已读 / 在读 / 未读），按详情页 frontmatter 的 updated 降序（缺省 created），
 * 无日期用文件更新时间兜底，未收集详情页的书排在最后。
 * 列：书名（有详情页才可点） | 笔记（无则「无」） | 所属书单 | 分类。
 */
function buildReadlog(lists) {
  const groups = { 读完: [], 在读: [], 未读: [] }
  for (const l of lists) {
    const text = readFileSync(join(l.path, 'README.md'), 'utf8')
    for (const title of bookListTitles(text)) {
      const bookFile = join(l.path, 'books', `${title}.md`)
      const mtime = existsSync(bookFile) ? statSync(bookFile).mtimeMs : -1
      const bookFm = existsSync(bookFile) ? parseFrontmatter(bookFile) : null
      const fmDate = bookFm?.updated || bookFm?.created // 与书单一致：updated 优先，缺省 created
      const date = fmDate && /^\d{4}-\d{2}-\d{2}/.test(fmDate) ? Date.parse(fmDate) : mtime
      const noteFm = existsSync(join(l.path, 'notes', title, 'README.md'))
        ? parseFrontmatter(join(l.path, 'notes', title, 'README.md'))
        : null
      const status = { reading: '在读', readed: '读完' }[readStatusOf(noteFm)] ?? '未读'
      groups[status].push({ title, date, list: l })
    }
  }
  const sortRow = (a, b) => (b.date !== a.date ? b.date - a.date : a.title.localeCompare(b.title))

  const table = (rows) => {
    rows.sort(sortRow)
    if (!rows.length) return '- _暂无_'
    const lines = rows.map(({ title, list }) => {
      const bookLink = existsSync(join(list.path, 'books', `${title}.md`))
        ? `[《${title}》](${link(rel(list, 'books', `${title}.md`))})`
        : `《${title}》`
      const noteLink = existsSync(join(list.path, 'notes', title, 'README.md'))
        ? `[查看](${link(rel(list, 'notes', title, 'README.md'))})`
        : '无'
      return `| ${bookLink} | ${noteLink} | [${list.name}](${link(rel(list, 'README.md'))}) | ${categoryLabel(list.cat)} |`
    })
    lines.unshift('| 书名 | 笔记 | 所属书单 | 分类 |', '| :--- | :--- | :--- | :--- |')
    return lines.join('\n')
  }

  return [
    `### 📗 已读书籍\n\n${table(groups.读完)}`,
    `### 📖 在读书籍\n\n${table(groups.在读)}`,
    `### 📕 未读书籍\n\n${table(groups.未读)}`,
  ].join('\n\n')
}

const lists = listBooklists()
let readme = readFileSync(README_FILE, 'utf8')
let problems = 0

// 前置契约检查：问题只提示（不影响落盘），保证一览表字段真实可用
for (const { cat, name, path } of lists) {
  const fm = parseFrontmatter(join(path, 'README.md'))
  if (!fm) {
    WARN(`${cat}/${name} 缺少 frontmatter，无法校验 name/category`)
    problems++
  } else {
    if (fm.name !== name) WARN(`${cat}/${name} frontmatter name「${fm.name}」与目录名不一致`)
    if (fm.category !== cat) WARN(`${cat}/${name} frontmatter category「${fm.category}」与所在目录「${cat}」不一致`)
  }
}

// 逐区替换，任何占位区缺失都视为契约问题，不落盘
const changed = []
for (const [name, body] of [
  ['BOOKLIST', buildBooklist(lists)],
  ['READLOG', buildReadlog(lists)],
]) {
  if (!readme.includes(banner(name)) || !readme.includes(footer(name))) {
    WARN(`README 缺少 <!-- ${name}:START/END --> 占位区，请补上后再跑`)
    problems++
    continue
  }
  const next = readme.replace(new RegExp(`${banner(name)}[\\s\\S]*?${footer(name)}`), region(name, body))
  if (next !== readme) changed.push(name)
  readme = next
}

if (readme !== readFileSync(README_FILE, 'utf8') && problems === 0) {
  writeFileSync(README_FILE, readme)
  OK(`README.md 已更新：${changed.join('、')}（${lists.length} 个书单）`)
} else if (problems === 0) {
  OK(`README.md 无变化（${lists.length} 个书单）`)
} else {
  WARN('存在上述契约问题，README 未落盘，请先修正')
}
