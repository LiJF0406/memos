# 进度跟踪：Memos「笔记(Notes)」功能

> 最后更新：2026-08-16
> 工作流：标准 SOP（主理人建队 → 产品经理 PRD → 架构师设计 → 工程师编码 → QA 测试）

## 一、总体状态

| 阶段 | 负责人 | 状态 |
|------|--------|------|
| 产品 PRD | 许清楚（产品经理） | ✅ 已完成 |
| 系统设计 + 任务分解 | 高见远（架构师） | ✅ 已完成 |
| 代码实现（T1~T5） | 寇豆码（工程师） | ✅ 已完成 |
| 测试验证 | 严过关（QA） | ✅ 已完成 |
| 交付总结 | 主理人 | ⏳ 未开始 |

## 二、相关文档

- 需求定稿与 PRD：`docs/notes/PRD.md`
- 架构设计与任务分解：`docs/notes/ARCHITECTURE.md`

## 三、实施记录

### 阶段 A · 代码实现（工程师寇豆码 — ✅ 已完成）

| 任务 | 内容 | 状态 |
|------|------|------|
| **T1** | proto 定义 `note_service.proto` + 三驱动迁移 `0.31/00__notes.sql` + 各 `LATEST.sql` | ✅ |
| **T2** | 存储层：`store/note*.go` 门面 + 三驱动 CRUD + `SetNoteRelations` 事务重算 | ✅ |
| **T3** | 后端 service + wikilink 解析 + 权限（`internal/markdown` 扩展 + `server/note_service.go` + 服务注册） | ✅ |
| **T4** | 前端数据层 + 路由 + 侧边栏入口（`connect.ts` + `useNoteQueries` + `/notes` 路由 + `Navigation`） | ✅ |
| **T5** | 前端页面 + 编辑器（`Notes.tsx` / `NoteDetail.tsx` + 文件夹树 + Live Preview + 双链 + 图片/导入导出） | ✅ |

**开发收尾期间修复的关键问题：**

1. **wikilink 解析从未生效（核心 Bug）**：`WikiLinkExtension` 优先级 200 与 goldmark 默认 `LinkParser`（同为 200）冲突，不稳定排序导致 `[[...]]` 始终被 link parser 抢占、不产生 `WikiLinkNode`。改为优先级 100 后双链解析、入库、反链全部生效（有单测锁定）。
2. **postgres `ListNotes` 占位符错位**：JOIN（tag 过滤）与 WHERE 各自从 `$1` 编号，合并参数后错位，`tag` + 其它过滤组合时 SQL 绑定错误。改为全局连续编号（有 store 测试覆盖）。
3. **文件夹移动可成环 → 删除死循环**：`UpdateNoteFolder` 未校验目标是否为自身后代，且 BFS 无 visited。服务层加环检测 + 目标权限校验，存储层 BFS 加 visited。
4. **删除非事务**：新增 Driver 方法 `DeleteNoteWithRelations` / `DeleteNoteFoldersAndNotes`，三驱动事务化删除（含将指向被删笔记的链接降级为 UNRESOLVED）。
5. **mysql 迁移列宽不一致**：`note_link.target_title` 256 → 512、`target_type` 256 → 16（保证 UNIQUE 键在 3072 字节内），与 wikilink 512 字节上限对齐。
6. **导入重名误判**：`uniqueNoteTitle` 由模糊搜索（LIKE）改为精确标题匹配。
7. **backlinks 泄露不可见源笔记**：`convertIncomingNoteLinks` 增加源笔记可见性过滤。
8. **GenerateSnippet 丢弃 `[[...]]` 内容**：补齐 `WikiLinkNode` 渲染 case。
9. **前端**：图片插入/纯文本粘贴按 Markdown 解析（`contentType: "markdown"`）、`note-wysiwyg` 编辑器样式、`objectURL` 释放、Live Preview 由「无效果装饰类」重写为**行级源码显示**（光标所在块叠加 Markdown 源码条，点击可编辑）、删除按钮与 `.md` 导入入口接线、硬编码文案 i18n 化。

**全局一致性审查：** ✅ 全部文件落地、`buf generate` 生成物更新（Go/OpenAPI/TypeScript）、三驱动迁移等价（`go test ./store/test/` 验证）、`IS_PASS: YES`

### 阶段 B · 测试验证（QA 严过关 — ✅ 已完成）

新增核心测试（全部通过）：

| 测试 | 位置 | 覆盖 |
|------|------|------|
| wikilink 解析（14 case + 混用 + snippet） | `internal/markdown/wikilink_test.go` | `[[...]]` 基本/去重/嵌套 `[`/跨行/空标题/512 字节上限/扩展开关 |
| 笔记权限（6 个测试） | `server/router/api/v1/test/note_service_test.go` | 私有读/写/删拒绝、共享文件夹全员控制、共享继承、文件夹移动环检测、双链解析入库（NOTE/UNRESOLVED）、导入标题去重 |
| 三驱动 store CRUD | `store/test/note_test.go` | Note/Folder 三驱动 CRUD、tag 过滤（覆盖 postgres 占位符）、`SetNoteRelations` 重算、级联删除、链接降级 UNRESOLVED |

**验证结果：**

| 检查项 | 结果 |
|--------|------|
| `buf generate` / `buf lint` | ✅ 通过 |
| `go build ./...` / `go vet ./...` | ✅ 通过 |
| `golangci-lint run`（v2.11.3） | ✅ 0 issues |
| `go test ./server/... ./internal/...` | ✅ 全部通过 |
| `go test ./store/test/`（sqlite/mysql/postgres 三驱动，Docker） | ✅ 通过（仅 2 个既有迁移测试受 Windows Docker 限制失败，见下） |
| `pnpm lint`（tsc + Biome） | ✅ 通过 |
| `pnpm test`（Vitest） | ✅ 237 passed |
| `pnpm build` | ✅ 通过 |
| HTTP 冒烟（`/api/v1/notes`、`/api/v1/note_folders` 未认证 401） | ✅ 通过 |

### 阶段 C · 交付（主理人 — ⏳ 未开始）

- [ ] 汇总交付总结：TL;DR、交付状态、测试通过率、文件清单、启动命令建议

## 四、已知限制（非阻断，记录在案）

1. **Live Preview 为行级实现**：光标所在块上方叠加显示 Markdown 源码条（架构文档允许的退化方案），与 Obsidian 块级源码显示有差距。
2. **笔记列表无分页**：前端固定 `pageSize: 200` 一次拉取（PRD P1-2 非阻断），超 200 条需翻页时暂不可达。
3. **i18n 仅 en/zh-Hans**：其余 41 种语言回退英文（架构文档允许后续补）。
4. **共享笔记并发编辑**：无冲突检测，后写覆盖（PRD 已知限制）。
5. **Windows 本地 `go test ./store/test/` 有 2 个失败**：`TestMigrationFromStableVersion` / `TestMigrationFromV0262PreservesLegacyData` 需启动旧版本 Docker 容器，容器配置使用 `os.Getuid()`（Windows 返回 -1）触发 Docker `uids and gids` 报错——**既有测试代码的环境限制**，Linux CI 正常。
6. **`-race` 需要 cgo**：本地 `CGO_ENABLED=0` 无法跑 race detector，CI（Linux）正常执行。
