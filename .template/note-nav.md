<!-- 笔记导航页模板。note.mjs 首次为一本书建笔记目录时生成 notes/<书名>/README.md，占位符 {{书名}}/{{笔记名}}/{{创建日期}}/{{更新日期}} 会被替换。
     本注释行在生成时自动剔除。字段怎么填请看 frontmatter 里的 # 注释；「笔记索引」表由 note.mjs 自动维护：每建一篇笔记自动登记一行（更新日期为登记当天，改过笔记可手动同步）。 -->
---
book: {{书名}}
# status：reading 在读 | readed 读完；只此两个值，其他或留空视为未读（脚本据此分已读/在读/未读）
status: reading
# created / updated：脚本自动填当天；改过笔记把 updated 顺手改成当天
created: {{创建日期}}
updated: {{更新日期}}
# 读完时填下面三项：finished 读完日期（YYYY-MM-DD）· rating 评分（如 5 或 ★★★★★）· tags 主题标签（如 [方法论, 心理学]）
finished:
rating:
tags: []
---

## 📇 笔记索引

| 笔记 | 更新日期 |
| :--- | :--- |
| [{{笔记名}}]({{笔记名}}.md) | {{更新日期}} |
