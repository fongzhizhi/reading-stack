// 校验：书单 README 清单 ⇄ books/ ⇄ notes/ 三点对齐 + frontmatter 契约。
// 用法：node scripts/check.mjs [--strict]
//   --strict：未收集 / 未记笔记也从「提醒」升级为「错误」，CI 用。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, listBooklists, parseFrontmatter, parseTables, bookListTitles, booklistStatus, readStatusOf, OK, WARN, ERR } from './lib.mjs'

const STRICT = process.argv.includes('--strict')

const notesDirs = (listPath) =>
  existsSync(join(listPath, 'notes'))
    ? readdirSync(join(listPath, 'notes')).filter((d) => !d.startsWith('.')).map((d) => join(listPath, 'notes', d))
    : []

// 只统计真实的笔记目录（目录即一篇笔记的根），忽略 .gitkeep 这类占位
const noteName = (dir) => dir.split(/[\\/]/).pop()

let errors = 0
let warnings = 0

for (const { cat, name, path } of listBooklists()) {
  console.log(`\n[${cat}/${name}]`)

  // ---------- frontmatter 契约 ----------
  const fm = parseFrontmatter(join(path, 'README.md'))
  if (!fm) {
    ERR('缺少 frontmatter')
    errors++
  } else {
    if (fm.name !== name) { ERR(`frontmatter name「${fm.name}」与目录名不一致`); errors++ }
    if (fm.category !== cat) { ERR(`frontmatter category「${fm.category}」与所在目录「${cat}」不一致`); errors++ }
    // 书单无 status 字段：总状态由清单书籍的阅读状态汇总（booklistStatus），这里不再校验
  }

  // ---------- 三点对齐 ----------
  const listPath = join(path, 'README.md')
  const titles = [...bookListTitles(readFileSync(listPath, 'utf8'))]
  const collected = existsSync(join(path, 'books'))
    ? readdirSync(join(path, 'books')).filter((f) => f.endsWith('.md') && !f.startsWith('.')).map((f) => f.slice(0, -3))
    : []
  const noteted = notesDirs(path)
    .filter((dir) => existsSync(join(dir, 'README.md')))
    .map(noteName)

  // ---------- 详情页链接验证 ----------
  // 只验「书目清单」表的 books/ 链接：链接 decode 后若与真实文件不符（即使裸名文件存在），报错。
  // 目标文件本身不存在 = 未收集，已由上面的提醒覆盖，不重复报。
  for (const table of parseTables(readFileSync(listPath, 'utf8'))) {
    const hdr = table[0].split('|').map((c) => c.trim())
    if (!hdr.includes('书籍') || !hdr.includes('详情页')) continue
    const bookIdx = hdr.indexOf('书籍')
    const detailIdx = hdr.indexOf('详情页')
    for (const row of table.slice(2)) {
      const cells = row.split('|').map((c) => c.trim())
      const m = cells[bookIdx]?.match(/《([^》]+)》/)
      const link = cells[detailIdx]?.match(/\]\(([^)]+)\)/)
      if (!m || !link) continue
      const bare = m[1]
      const href = link[1].trim()
      if (!href.startsWith('books/')) continue
      let fname
      try { fname = decodeURIComponent(href.replace(/^books\//, '')) }
      catch { ERR(`《${bare}》详情页链接编码非法：${href}`); errors++; continue }
      const linkExists = existsSync(join(path, 'books', fname))
      const realExists = existsSync(join(path, 'books', `${bare}.md`))
      if (linkExists) continue
      if (realExists) {
        ERR(`《${bare}》详情页链接写错：链接指向 books/${fname}，实际文件是 books/${bare}.md`)
        errors++
      }
    }
  }

  console.log(`  清单 ${titles.length} 本 · 已收集 ${collected.length} · 有笔记 ${noteted.length}`)

  if (titles.length === 0) { ERR('书目清单表为空：表头需含「书籍」列') ; errors++ }

  const missingCollected = titles.filter((t) => !collected.includes(t)) // 未收集（无详情页）
  const missingNoteted = titles.filter((t) => !noteted.includes(t))     // 未开笔记
  const orphanCollected = collected.filter((t) => !titles.includes(t))  // 孤儿：books 有但清单没登记
  const orphanNoteted = noteted.filter((t) => !titles.includes(t))      // 孤儿：notes 有但清单没登记

  // 书单总状态 = 书籍阅读状态汇总：推导为「在读」时才提醒缺笔记（未读书单没笔记是预期，只看收集情况，减少噪声）
  const skipNotes = booklistStatus(path) !== 'reading'

  // 有笔记目录但导航页 status 未识别（应为 reading/readed，其他值或空视为未读）→ 提醒补状态
  // 索引表与笔记文件一致性：登记了但文件不存在 → 错误；文件存在但没登记 → 提醒（note --sync 可自动修复）
  for (const dir of notesDirs(path)) {
    const nav = join(dir, 'README.md')
    if (existsSync(nav) && !readStatusOf(parseFrontmatter(nav))) {
      WARN(`《${noteName(dir)}》笔记导航页 status 未识别（应为 reading/readed）`)
      warnings++
    }
    if (!existsSync(nav)) continue
    const registered = new Set()
    for (const line of readFileSync(nav, 'utf8').split(/\r?\n/)) {
      if (!line.trimStart().startsWith('|')) continue
      const m = line.match(/\[([^\]]+)\]\(([^)]+\.md)\)/)
      if (!m) continue
      const file = m[2].replace(/^\.\//, '')
      if (file === 'README.md' || file.includes('/')) continue
      registered.add(file)
      if (!existsSync(join(dir, file))) {
        ERR(`《${noteName(dir)}》导航页登记了不存在的笔记：${file}（删了笔记就删掉这行，或 npm run note <目录> --sync）`)
        errors++
      }
    }
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
      if (!registered.has(f)) {
        WARN(`《${noteName(dir)}》有笔记未在导航页登记：${f}（npm run note <目录> --sync 可自动补）`)
        warnings++
      }
    }
  }

  for (const t of missingCollected) { WARN(`未收集：《${t}》`); warnings++ }
  if (!skipNotes) for (const t of missingNoteted) { WARN(`未记笔记：《${t}》`); warnings++ }
  for (const t of orphanCollected) { ERR(`孤儿：books/ 有《${t}》但清单未登记`); errors++ }
  for (const t of orphanNoteted) { ERR(`孤儿：notes/ 有《${t}》但清单未登记`); errors++ }

  if (errors === 0 && warnings === 0) OK('一切对齐')
}

console.log(`\n=== 校验完成：${errors} 个错误，${warnings} 个提醒 ===`)
process.exit(errors > 0 || STRICT && warnings > 0 ? 1 : 0)