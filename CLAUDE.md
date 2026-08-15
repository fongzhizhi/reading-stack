# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目本质

个人阅读管理仓库（"阅读栈"）：markdown 内容 + Node 脚本维护体系，**零依赖、无构建、无测试、Node ≥ 18**。日常工作是维护书单/书籍/笔记内容并跑脚本，而不是写业务代码。

## 常用命令

```bash
npm run index                        # 聚合各书单 frontmatter，重生成根 README 的「书单一览 + 读书记录」占位区（可重复跑）
npm run check                        # 校验「书单书目 ↔ books/ ↔ notes/」三点对齐 + frontmatter 契约 + 详情页链接有效性
npm run check -- --strict            # 把「提醒」也升级为「错误」（CI 用）
npm run scaffold [src]               # 补齐书单结构：books/ + 详情页 + 清单表链接（幂等，src 省略 = 当前目录）
npm run note <笔记目录> [笔记名]      # 新建笔记，如 note programming/定锚/notes/程序员修炼之道；首次自动生成导航页
npm run note:sync <笔记目录>          # 同步导航页「笔记索引」：删死链、补漏登
```

⚠️ **npm 会吞掉以 `-` 开头的参数**：同步索引必须用 `npm run note:sync <目录>`，不要用 `npm run note <目录> --sync`（会被误判为新建笔记）。node 直接跑时 `node scripts/note.mjs <目录> --sync` 兼容。

## 内容结构（三级）

```
大分类（英文目录名）/ 书单（中文目录名）/
    ├── README.md     # 书单导航：frontmatter + 书目清单表 + 怎么读 + 验收标准
    ├── books/        # 每本书一个 <书名>.md：介绍 + 如何获取（电子书本体不入库，放网盘）
    └── notes/        # 每本书一个目录：README.md 导航页 + YYYY-MM-DD-主题.md 单篇笔记
```

- 分类目录：`programming / history / economics / psychology / yi / zhuzi / literature / others`。分类顺序与展示名由 [scripts/lib.mjs](scripts/lib.mjs) 的 `CATEGORY_MAP` 决定，新增分类改那里。
- 单本书也兼容：当单本书单，清单表只写一行。

## 核心契约：书名 = 主键（三点对齐）

一本书的书名同时出现在三处，**必须完全一致**，脚本靠它校验与聚合：

1. 书单 README 清单表「书籍」列（写 `《书名》`，表头必须含「书籍」列，其他表格里的《》不算书）
2. `books/<书名>.md`
3. `notes/<书名>/README.md`

- 书名**不带版本号**（版本写清单表「版本要求」列），否则同名不同版会被判为两本书。
- 链接用相对路径，中文文件名必须 URL 编码（脚本用 `encodeURI` 生成）。

## frontmatter 契约（脚本解析依据）

- **书单 README**：`name`（= 目录名）/ `created` / `updated`（可选，排序优先）/ `category`（= 所在分类目录）/ `description`。**不手填 `status`**——书单总状态由清单书籍的阅读状态汇总（全部读完→已读，有在读→在读，否则未读）。
- **books/<书名>.md**：`book` / `author` / `version` / `created` / `updated`。
- **notes/<书名>/README.md**（导航页）：`book` / `status` / `created` / `updated` / `finished` / `rating` / `tags`。`status` 只允许 `reading`（在读）| `readed`（读完），其他值或为空一律视为未读——**勿引入第三个值**。
- **notes/<书名>/YYYY-MM-DD-主题.md**（单篇笔记）：`title` / `book` / `created` / `updated`。

## 脚本机制（scripts/ 均为零依赖 .mjs）

- [lib.mjs](scripts/lib.mjs)：公共工具——`CATEGORY_MAP`、`parseFrontmatter`（仅简单键值解析）、`bookListTitles`（只认含「书籍」表头的表）、`booklistStatus`（书单状态汇总）、`listBooklists`（发现所有书单）。
- [index.mjs](scripts/index.mjs)：重写根 README 的 `<!-- BOOKLIST:START/END -->` 与 `<!-- READLOG:START/END -->` 两个占位区。**占位区内容勿手动编辑**；发现 frontmatter 契约问题时只提示不落盘。
- [check.mjs](scripts/check.mjs)：错误 = 孤儿（books/notes 有而清单没登记）、导航页死链、详情页链接写错；提醒 = 未收集（清单有但无详情页）、未记笔记（仅书单状态为「在读」时）、status 未识别、漏登记。退出码按错误数。
- [scaffold.mjs](scripts/scaffold.mjs)：从清单表解析书名/作者/版本，生成详情页骨架并补清单表「详情页」列链接。幂等，`wx` 标志绝不覆盖已有文件。src 可为任意层级。
- [note.mjs](scripts/note.mjs)：校验笔记目录必须形如 `<书单>/notes/<书名>`、书名必须在清单里，重名不创建；自动维护导航页索引（新建笔记时追加一行，`sync` 子命令对齐索引）。

## 模板体系：改格式只改 .template/

内容格式（详情页/笔记/导航页/书单 README）由 [.template/](.template/) 下的模板文件定义，脚本读取后剔除维护注释（`<!-- -->`）、替换占位符（`{{书名}}`、`{{作者}}`、`{{创建日期}}` 等）。改格式改模板即可，只对新生成的文件生效。新增书单时复制 `.template/booklist/` 的 README + books/ + notes/（**不要**复制 usage.md）。

## 日常工作流

1. **开书单**：复制模板 → 填 frontmatter + 清单表 + 怎么读 + 验收标准 → `npm run scaffold` 补结构 → `npm run check` → `npm run index`。
2. **加书**：清单表加一行 `《书名》` → 重跑 `npm run scaffold`（自动生成详情页 + 链接）。
3. **写笔记**：`npm run note <书单>/notes/<书名>`；读完时把导航页 `status` 改为 `readed` 并填 `finished/rating/tags`；手动删过笔记后跑 `npm run note:sync`。

改完内容后跑 `npm run check && npm run index` 验证与刷新根 README。
