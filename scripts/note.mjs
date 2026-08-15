// 笔记：为一本书新建一篇笔记（首次建笔记时自动补齐 notes/<书名>/README.md 导航页）。
// 用法：node scripts/note.mjs <笔记目录> [笔记名]　|　node scripts/note.mjs sync <笔记目录>
//   笔记目录：<书单>/notes/<书名>，如 programming/定锚/notes/程序员修炼之道（相对/绝对路径均可，不存在会自动创建）；
//   笔记名：可选，默认「YYYY-MM-DD-HHmm」（当天+当前时刻）；与已有笔记重名则报错不创建，需换个笔记名。
//   sync：同步导航页索引——删掉登记了但笔记文件不存在的行、补登存在但没登记的行。
//     ⚠️ 子命令必须写成 sync <目录>：npm run 会吞掉 --sync 这类参数（等价于没传，会误建笔记）。
//     用 node 直接跑时写 node scripts/note.mjs <目录> --sync 也兼容。
//   校验不通过（目录形式 / 书名 / 重名）一律输出原因并不落盘。
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { ROOT, parseFrontmatter, bookListTitles, OK, WARN, ERR } from './lib.mjs'

const NOTE_TEMPLATE = join(ROOT, '.template', 'note.md')
const NAV_TEMPLATE = join(ROOT, '.template', 'note-nav.md')

/** 本地日期（YYYY-MM-DD）；withTime 时附当前时刻（HHmm），作默认笔记名。 */
const stamp = (withTime = false) => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return withTime ? `${date}-${p(d.getHours())}${p(d.getMinutes())}` : date
}

/** 模板来自 .template/note.md 与 note-nav.md（注释行不进入产物）。 */
const loadTemplate = (file, label) => {
  if (!existsSync(file)) {
    ERR(`找不到模板：${file}（${label}依赖它）`)
    process.exit(1)
  }
  return readFileSync(file, 'utf8')
    .replace(/^\s*<!--[\s\S]*?-->\s*$/gm, '') // 剔除模板维护注释
    .replace(/^\n+/, '') // 去掉开头空行
}

/** 剔除 frontmatter 内的 # 注释行（模板里的填写说明不进入产物）。 */
const stripFmComments = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return text
  const eol = m[1].includes('\r\n') ? '\r\n' : '\n'
  const kept = m[1].split(/\r?\n/).filter((l) => !l.trimStart().startsWith('#'))
  return text.replace(m[1], kept.join(eol))
}

let [src, givenName] = process.argv.slice(2)
if (src === 'sync') {
  // 子命令形式（npm run note sync <目录>）：--sync 会被 npm 吞掉，用无 - 前缀的 sync 代替
  src = process.argv[3]
  givenName = '--sync'
}
if (!src) {
  console.log('用法：node scripts/note.mjs <笔记目录> [笔记名]　|　node scripts/note.mjs sync <笔记目录>\n  笔记目录：<书单>/notes/<书名>，如 programming/定锚/notes/程序员修炼之道；笔记名可选，默认「YYYY-MM-DD-HHmm」')
  process.exit(1)
}

// ---------- 笔记目录：必须是 <书单>/notes/<书名> 形式 ----------
const noteDir = resolve(process.cwd(), src)
const book = basename(noteDir)
const listDir = dirname(dirname(noteDir)) // 书单目录
if (basename(dirname(noteDir)) !== 'notes') {
  ERR(`笔记目录必须形如「<书单>/notes/<书名>」，你给的是：${src}`)
  process.exit(1)
}

// ---------- 书单目录校验：存在 + README.md + frontmatter name 与目录名一致 ----------
const listName = basename(listDir)
if (!existsSync(listDir) || !statSync(listDir).isDirectory()) {
  ERR(`书单目录不存在：${listDir}`)
  process.exit(1)
}
const readme = join(listDir, 'README.md')
if (!existsSync(readme)) {
  ERR(`「${listDir}」下没有 README.md，不是书单目录`)
  process.exit(1)
}
const fm = parseFrontmatter(readme)
if (!fm || fm.name !== listName) {
  ERR(`frontmatter name「${fm?.name ?? '缺失'}」与目录名「${listName}」不一致`)
  process.exit(1)
}

// ---------- 书名校验：目录名必须在书目清单里 ----------
const titles = [...bookListTitles(readFileSync(readme, 'utf8'))]
if (!titles.includes(book)) {
  ERR(`《${book}》不在「${listName}」的书目清单中（当前 ${titles.length} 本：${titles.join('、')}）`)
  process.exit(1)
}

// ---------- --sync：同步导航页索引后退出（不做新建） ----------
if (givenName === '--sync') {
  syncIndex(noteDir)
  process.exit(0)
}

// ---------- 笔记名：默认「YYYY-MM-DD-HHmm」，防路径逃逸，重名不覆盖 ----------
const name = givenName || stamp(true)
if (name !== basename(name)) {
  ERR(`笔记名不能包含路径分隔符：${name}`)
  process.exit(1)
}
const noteFile = join(noteDir, `${name}.md`)
if (existsSync(noteFile)) {
  ERR(`笔记已存在：${noteFile}\n  换个笔记名再试（默认名撞车时请显式指定笔记名）`)
  process.exit(1)
}

// ---------- 建笔记（先建目录；wx 双保险绝不覆盖） ----------
mkdirSync(noteDir, { recursive: true })
try {
  writeFileSync(
    noteFile,
    loadTemplate(NOTE_TEMPLATE, 'note')
      .replaceAll('{{书名}}', book)
      .replaceAll('{{笔记名}}', name)
      .replaceAll('{{创建日期}}', stamp())
      .replaceAll('{{更新日期}}', stamp()),
    { flag: 'wx' },
  )
} catch (e) {
  ERR(e.code === 'EEXIST' ? `笔记已存在：${noteFile}` : `创建笔记失败（${e.code}）：${e.message}`)
  process.exit(1)
}
OK(`已创建笔记：${noteFile}`)

// ---------- 导航页：首次补齐，之后自动登记索引行 ----------
const navFile = join(noteDir, 'README.md')
if (!existsSync(navFile)) {
  writeFileSync(
    navFile,
    stripFmComments(loadTemplate(NAV_TEMPLATE, 'note'))
      .replaceAll('{{书名}}', book)
      .replaceAll('{{笔记名}}', name)
      .replaceAll('{{创建日期}}', stamp())
      .replaceAll('{{更新日期}}', stamp()),
  )
  OK(`首次建笔记，已补齐导航页（索引首行已登记）：${navFile}`)
} else {
  appendIndexRow(navFile, name)
}

/** 在导航页「笔记索引」表末尾追加一行登记；导航页没有索引表时在文末补一个小节。 */
function appendIndexRow(navFile, name) {
  const text = readFileSync(navFile, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  let tableEnd = -1
  let inIndex = false
  for (let i = 0; i < lines.length; i++) {
    const isTable = lines[i].trimStart().startsWith('|')
    if (isTable && lines[i].includes('更新日期')) {
      // 「笔记索引」表头行（| 笔记 | 更新日期 |）
      inIndex = true
      tableEnd = i
    } else if (inIndex && isTable) {
      tableEnd = i
    } else if (inIndex) {
      break // 出了索引表
    }
  }
  const row = `| [${name}](${name}.md) | ${stamp()} |`
  if (tableEnd >= 0) {
    lines.splice(tableEnd + 1, 0, row)
    writeFileSync(navFile, lines.join(eol))
  } else {
    writeFileSync(
      navFile,
      text.replace(/\s*$/, '') +
        eol + eol + '## 📇 笔记索引' + eol + eol +
        '| 笔记 | 更新日期 |' + eol + '| :--- | :--- |' + eol + row + eol,
    )
  }
  OK(`已在导航页「📇 笔记索引」登记：${name}`)
}

/** --sync：同步导航页「笔记索引」表——删掉登记了但文件不存在的行，补上存在但没登记的行。 */
function syncIndex(noteDir) {
  const navFile = join(noteDir, 'README.md')
  if (!existsSync(navFile)) {
    ERR(`没有导航页可同步：${navFile}（首次建笔记时会自动生成）`)
    process.exit(1)
  }
  const text = readFileSync(navFile, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)

  // 定位索引表：表头（含「更新日期」）→ 分隔行 → 数据行（直到首个非表格行）
  let hdr = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('|') && lines[i].includes('更新日期')) { hdr = i; break }
  }
  if (hdr < 0) {
    WARN(`导航页没有「笔记索引」表，跳过同步：${navFile}`)
    return
  }
  const sep = hdr + 1 // 分隔行
  let end = sep + 1
  while (end < lines.length && lines[end].trimStart().startsWith('|')) end++

  // 登记行 → {file, line}；只认本目录下的笔记链接，忽略 README.md 与子目录
  const parseRow = (line) => {
    const m = line.match(/\[([^\]]+)\]\(([^)]+\.md)\)/)
    if (!m) return null
    const file = m[2].replace(/^\.\//, '')
    if (file === 'README.md' || file.includes('/')) return null
    return { file, line }
  }

  const rows = lines.slice(sep + 1, end).map(parseRow).filter(Boolean)
  const kept = []
  let removed = 0
  const seen = new Set()
  for (const r of rows) {
    if (existsSync(join(noteDir, r.file))) { kept.push(r); seen.add(r.file) }
    else removed++
  }

  // 补登记：目录下存在但没登记的 .md 笔记，日期取 frontmatter updated（缺省 created，再缺省当天）
  const noteDate = (file) => {
    const fm = parseFrontmatter(join(noteDir, file))
    const d = fm?.updated || fm?.created
    return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : stamp()
  }
  let added = 0
  for (const f of readdirSync(noteDir).sort()) {
    if (!f.endsWith('.md') || f === 'README.md' || seen.has(f)) continue
    const name = f.slice(0, -3)
    kept.push({ file: f, line: `| [${name}](${f}) | ${noteDate(f)} |` })
    added++
  }

  writeFileSync(navFile, [...lines.slice(0, sep + 1), ...kept.map((r) => r.line), ...lines.slice(end)].join(eol))
  OK(removed || added
    ? `索引已同步：删除 ${removed} 条死链登记${added ? `，补登 ${added} 篇` : ''}（现有 ${kept.length} 条）`
    : `索引已同步，无变化（${kept.length} 条）`)
}
