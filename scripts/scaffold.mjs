// 脚手架：新书单 README 写好之后跑一次，补齐结构。
// 场景：人写 README（含书单清单）→ 跑本脚本 → 得到
//   1. books/ 目录（含 .gitkeep）
//   2. 每本书的 books/<书名>.md 详情页骨架（frontmatter 从清单表格自动填作者/版本）
//   3. 清单表格「详情页」列自动补上正确 URL 编码的链接（已有链接不覆盖）
// 幂等：重复执行、或人手动建过文件，一律跳过，绝不覆盖已有内容。书单更新后重跑，缺的会补上。
//
// 用法：node scripts/scaffold.mjs [src]
//   src 可以是任意层级，省略 = 当前目录（npm run scaffold 时即项目根）：
//     根目录          → 遍历所有学科目录下所有书单
//     学科目录         → 遍历其下所有书单
//     书单目录         → 只处理它
//   每个书单执行前校验：目录下必须有 README.md，且含 frontmatter 与「书目清单」表，否则输出说明并跳过。
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { ROOT, parseFrontmatter, OK, WARN } from './lib.mjs'

const SKIP_CATS = new Set(['.git', '.template', 'scripts', 'docs', 'node_modules'])

const isDir = (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false
const hasReadme = (dir) => existsSync(join(dir, 'README.md'))

/** 详情页模板来自 .template/book.md（注释行不进入产物），改格式不用动代码。 */
const TEMPLATE_FILE = join(ROOT, '.template', 'book.md')
function loadBookTemplate() {
  if (!existsSync(TEMPLATE_FILE)) {
    console.error(`❌ 找不到详情页模板：${TEMPLATE_FILE}（scaffold 依赖它生成 books/<书名>.md）`)
    process.exit(1)
  }
  return readFileSync(TEMPLATE_FILE, 'utf8')
    .replace(/^\s*<!--[\s\S]*?-->\s*$/gm, '') // 剔除模板维护注释
    .replace(/^\n+/, '') // 去掉开头空行
}

/** 今天的本地日期（YYYY-MM-DD）。 */
const today = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 渲染详情页骨架。name 不带《》。created/updated 自动填当天，后续由人按需改。 */
function renderBookSkeleton(tpl, { name, author, version }) {
  return tpl
    .replaceAll('{{书名}}', name)
    .replaceAll('{{作者}}', author || '待补充')
    .replaceAll('{{版本}}', version || '待补充')
    .replaceAll('{{ISBN}}', '待补充')
    .replaceAll('{{创建日期}}', today())
    .replaceAll('{{更新日期}}', today())
}

/**
 * 把 src（任意层级）解析为「书单目录」列表。
 * 规则：目标是书单（含 README.md）→ 只处理它；否则找它下一层的书单；
 *       目标是项目根（两级都找不到时兜底）→ 遍历 学科目录 → 书单目录 两级。
 * 一个目录都被认为是 "学科"：它的一级子目录里有含 README.md 的目录，那些就是书单。
 */
function resolveBooklists(src) {
  const target = src ? resolve(process.cwd(), src) : process.cwd()
  if (!isDir(target)) {
    console.log(`❌ 目录不存在：${target}`)
    process.exit(1)
  }

  const booklistOf = (dir) => ({ path: dir, name: basename(dir), cat: relative(ROOT, dirname(dir)).split(sep)[0] })

  // 情况一：目标是项目根 → 两级遍历（学科目录下找书单目录）
  if (target === ROOT) {
    const lists = []
    for (const cat of readdirSync(ROOT).sort()) {
      if (SKIP_CATS.has(cat) || cat.startsWith('.')) continue
      const catPath = join(ROOT, cat)
      if (!isDir(catPath)) continue
      for (const d of readdirSync(catPath)) {
        if (d.startsWith('.')) continue
        const listPath = join(catPath, d)
        if (isDir(listPath) && hasReadme(listPath)) lists.push(booklistOf(listPath))
      }
    }
    if (lists.length) return lists
    console.log(`❌ 项目根下没有发现任何书单（需形如 学科目录/书单目录/README.md）`)
    process.exit(1)
  }

  // 情况三：目标自身就是书单（含 README.md）
  if (hasReadme(target)) return [booklistOf(target)]

  // 情况二：下一层有书单（学科目录）
  const oneLevel = readdirSync(target)
    .filter((d) => !d.startsWith('.') && !d.endsWith('.md') && hasReadme(join(target, d)))
    .map((d) => booklistOf(join(target, d)))
  if (oneLevel.length) return oneLevel

  console.log(`❌ 「${target}」不是书单目录，下一层也没有书单。\n   层级应为：项目根 > 学科目录 > 书单目录（书单目录下需有 README.md）`)
  process.exit(1)
}

/** 找到表头含「书籍」列的表格。返回其表头单元格数组（split('|') 原样，含首尾空串）。 */
function findHeadTable(lines) {
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.trim())
    if (cells.includes('书籍')) {
      const block = [lines[i]]
      for (let j = i + 1; j < lines.length && lines[j].trimStart().startsWith('|'); j++) block.push(lines[j])
      return { header: cells, block }
    }
  }
  return null
}

/** 执行前的校验：README 存在（resolve 已保证）、frontmatter 与「书目清单」表齐备。返回 { ok, reason }。 */
function validate(listPath) {
  const readmeFile = join(listPath, 'README.md')
  if (!hasReadme(listPath)) return { ok: false, reason: '目录下没有 README.md' }
  const fm = parseFrontmatter(readmeFile)
  if (!fm) return { ok: false, reason: 'README.md 缺少 frontmatter（需含 name/category/status/description）' }
  const head = findHeadTable(readFileSync(readmeFile, 'utf8').split(/\r?\n/))
  if (!head) return { ok: false, reason: '缺少「书目清单」表（表头需含「书籍」列）' }
  if (fm.name !== basename(listPath)) return { ok: false, reason: `frontmatter name「${fm.name}」与目录名「${basename(listPath)}」不一致` }
  return { ok: true, head }
}

/** 处理单个书单：建 books/、补详情页、补链接。返回 { created, links }。 */
function processBooklist(booklist) {
  const { path, name, cat } = booklist
  const readmeFile = join(path, 'README.md')
  const text = readFileSync(readmeFile, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)

  const { head } = validate(path)
  const { header } = head
  const bookIdx = header.indexOf('书籍')
  const authorIdx = header.indexOf('作者')
  const versionIdx = header.indexOf('版本要求')
  const detailIdx = header.indexOf('详情页')

  // ---------- 1. books/ 目录 ----------
  const booksDir = join(path, 'books')
  if (!existsSync(booksDir)) {
    mkdirSync(booksDir)
    writeFileSync(join(booksDir, '.gitkeep'), '')
    OK('已创建 books/')
  }

  // ---------- 2. 逐本建详情页（已存在则跳过，wx 双保险绝不覆盖） ----------
  const created = []
  const skipped = []
  for (let i = 2; i < head.block.length; i++) {
    const line = head.block[i]
    if (/^[-|: ]+$/.test(line)) continue // 分隔行
    const row = line.split('|').map((c) => c.trim())
    const m = row[bookIdx]?.match(/《([^》]+)》/)
    if (!m) continue
    const bare = m[1] // 文件名主键：不带《》
    const file = join(booksDir, `${bare}.md`)
    if (existsSync(file)) {
      skipped.push(bare)
      continue
    }
    writeFileSync(
      file,
      renderBookSkeleton(bookTemplate, {
        name: bare,
        author: authorIdx >= 0 ? row[authorIdx] : '',
        version: versionIdx >= 0 ? row[versionIdx] : '',
      }),
      { flag: 'wx' } // 文件已存在则抛错，绝不覆盖
    )
    created.push(bare)
  }

  // ---------- 3. 表格「详情页」列补链接（有内容不覆盖；无该列则提示） ----------
  let links = 0
  if (detailIdx < 0) {
    WARN('清单表没有「详情页」列，跳过链接补全（可手动补：`[books/书名.md](books/书名.md)`）')
  } else {
    let inTable = false
    const out = []
    for (const line of lines) {
      const isTableLine = line.trimStart().startsWith('|')
      if (inTable) {
        if (!isTableLine) {
          inTable = false
          out.push(line)
          continue
        }
        if (/^[-|: ]+$/.test(line.trim())) { out.push(line); continue } // 分隔行
        const row = line.split('|').map((c) => c.trim())
        if (!row[bookIdx]?.trim() || row[detailIdx]?.trim()) { out.push(line); continue } // 无书名或已有链接
        const m = row[bookIdx].match(/《([^》]+)》/)
        if (!m) { out.push(line); continue }
        const bare = m[1]
        const href = encodeURI(`books/${bare}.md`)
        const next = [...row]
        next[detailIdx] = ` [books/${bare}.md](${href}) `
        out.push(next.join(' | '))
        links++
      } else {
        out.push(line)
        if (isTableLine && line.includes('| 书籍')) inTable = true
      }
    }
    if (links) writeFileSync(readmeFile, out.join(eol))
  }

  if (created.length) OK(`已创建 ${created.length} 个详情页：${created.join('、')}`)
  if (skipped.length) OK(`已存在，跳过 ${skipped.length} 个：${skipped.join('、')}`)
  if (links) OK(`清单表已补 ${links} 个详情页链接`)
  if (!created.length && !skipped.length && !links) WARN('没有需要处理的内容（清单表格里没解析到书名？行首需为《书名》）')

  return { created: created.length, links, skipped: skipped.length }
}

const bookTemplate = loadBookTemplate() // 只加载一次，全部书单共用

const targets = resolveBooklists(process.argv[2])
console.log(`\n共 ${targets.length} 个书单待处理`)
const results = []
for (const t of targets) {
  console.log(`\n[${t.cat}/${t.name}]`)
  const v = validate(t.path)
  if (!v.ok) {
    console.log(`  ⚠️  校验未通过：${v.reason}。已跳过（修好后重跑即可）`)
    results.push({ ok: false, reason: v.reason })
    continue
  }
  results.push({ ok: true, ...processBooklist(t) })
}

const okList = results.filter((r) => r.ok)
const badList = results.filter((r) => !r.ok)
const summary = `=== 完成：${targets.length} 个书单，成功 ${okList.length}，跳过 ${badList.length}`
console.log(`\n${summary} ===`)
if (okList.length) {
  const created = okList.reduce((s, r) => s + r.created, 0)
  const links = okList.reduce((s, r) => s + r.links, 0)
  console.log(`  新增详情页 ${created} 个 · 补链接 ${links} 个`)
}
for (const b of badList) console.log(`  ⚠️  未处理：${b.reason}`)
console.log('  全量校验用：npm run check；刷新一览表用：npm run index')
process.exit(badList.length ? 1 : 0)