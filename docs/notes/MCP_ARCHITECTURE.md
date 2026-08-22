# Notes 文档接口架构：外部 Agent 通过 MCP 增删改查

> 状态：设计草案（未实现）
> 关联文档：`docs/notes/PRD.md`、`docs/notes/ARCHITECTURE.md`
> 原则：REST API 是权威契约，MCP 是面向 Agent 的语义适配层，不复制业务逻辑。

## 1. 背景与目标

当前分支 `feat/notes` 已经实现了一套独立的 Notes 功能：`note`、`note_folder`、`note_link`、`note_tag` 四张表，`NoteService` / `NoteFolderService` 全量 CRUD，双链解析、标签提取、文件夹共享权限、Markdown 渲染与 Live Preview 编辑器。

本设计要解决的是“外部 Agent 对文档做增删改查”：

- Agent 应能通过 MCP 协议读写 Memos 中的笔记（Markdown 原文），而不是依赖浏览器或手写 HTTP。
- Agent 的接口语义应接近“文档”，而不是 Memos 内部的 REST 资源结构。
- 文档的存储、权限、双链/标签解析仍然只由现有 API 服务执行，MCP 不做第二套业务逻辑。

## 2. 现状

### 2.1 公共 API 已具备

- `proto/api/v1/note_service.proto` 定义 `NoteService` 与 `NoteFolderService`，已生成 REST/Connect/gRPC-Gateway 路由。
- `server/router/api/v1/note_service.go` 实现 CRUD、搜索、导入导出与权限校验。
- `store/` 已有三驱动（SQLite/MySQL/PostgreSQL）的 note/folder/link/tag 实现与迁移。
- 前端通过 `web/src/hooks/useNoteQueries.ts` 消费同一套 API。

### 2.2 MCP 服务已存在

- `server/router/mcp/` 是 OpenAPI-driven MCP 服务，挂在 `/mcp`，使用 Streamable HTTP 传输。
- 工具从 `proto/gen/openapi.yaml` 的 `operationId` 派生，当前 allowlist 只包含 memo 与 attachment 操作（见 `catalog.go` 的 `curatedOperationIDs`）。
- 工具调用通过 in-process Echo 请求执行 `/api/v1/...`，复用 API 的认证、鉴权和错误语义。

## 3. 问题分析

### 3.1 REST 是面向 UI 的，不是面向 Agent 的

Notes 的 REST API 是标准的资源 CRUD：

- 文档定位依赖 `notes/{uid}` 资源名，Agent 通常只知道标题或关键词。
- `UpdateNote` 要求调用方自行维护 `FieldMask`，这是 UI 客户端的习惯，对 Agent 是反模式。
- 请求体是嵌套的 `{ "note": { ... } }` 结构，工具输入 schema 会因此变得笨重。

### 3.2 MCP 没有“语义工具”通道

当前 MCP 的每个工具都由 OpenAPI operation 直接派生。把 Notes operations 加入 allowlist 虽然改动最小，但 Agent 会看到 `note_update_note`、`body`、`updateMask` 等纯 API 语义，且工具命名出现 `note_get_note` 这类重复结构。

### 3.3 服务层边界偏薄

- 权限检查、文件夹链解析、双链目标解析都挂在 `server/router/api/v1` 的 handler 上，每个方法重复“加载全部文件夹 -> 校验当前用户 -> 判断共享态”的流程。
- `UpdateNote` 先更新 `note`，再调用 `rebuildNoteRelations` 删除并重建 `note_link` / `note_tag`，两步不在同一事务中；第二步失败会留下“正文已更新、关系表未更新”的不一致状态。
- MCP 只能通过 HTTP 自调用间接复用业务逻辑。当前规模可以接受，但随着 Agent 工具增多，需要更明确的适配层。

### 3.4 缺少 Agent 需要的检索能力

当前只有标题模糊搜索和标签过滤，没有按标题精确定位，也没有正文全文搜索。Agent 的常见操作是“找一篇标题为 X 的文档”或“搜索包含某关键词的文档”，这两点在当前 API 上只能勉强组合实现。

## 4. 目标与非目标

### 目标

- 提供 7-8 个语义化 MCP 工具，覆盖文档的增删改查、搜索和导出。
- MCP 工具调用复用现有 REST API 的认证、权限、双链/标签解析逻辑。
- 保持现有 OpenAPI-driven MCP 架构不变，在其上增加自定义工具注册通道。
- 让前端与外部 Agent 使用同一份数据契约，行为一致。

### 非目标

- 不新建一套独立的 DocumentService proto 来替代现有 NoteService。
- 不把全部 Notes REST operations 原样暴露为 MCP 工具。
- 不在 MCP 层实现全文搜索、双链解析或权限判断。
- 第一版不提供 MCP resources/prompts，只提供 tools。
- 不重构 Notes 前端编辑器。

## 5. 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| A. 直接扩展 allowlist | 把 `NoteService_*` / `NoteFolderService_*` 加入 `curatedOperationIDs` | 改动最小，约几行代码 | Agent 面对 uid、FieldMask、嵌套 body，工具命名重复，体验差 | 不采用 |
| B. 文档语义工具层（推荐） | 保留 OpenAPI 派生工具，同时新增自定义 `note_*` 工具，内部组合 REST 调用 | Agent 体验好，REST 保持稳定，权限/解析逻辑完全复用 | MCP 包需要增加自定义工具注册通道和约 7 个 handler | 采用 |
| C. 新建 DocumentService proto | 为文档单独定义面向 Agent 的 REST API，再走 OpenAPI 派生 MCP | 契约最统一 | 与现有 NoteService 重复，改动面大，偏离上游 MCP 设计 | 暂不采用 |

## 6. 推荐架构

```text
外部 Agent（Claude / Codex / Cursor 等）
        │ MCP Streamable HTTP + Authorization: Bearer
        ▼
server/router/mcp
  ├── OpenAPI 派生工具（memo / attachment，保持不变）
  └── 文档语义工具（新增 notes_tools.go：note_list / note_read / ...）
        │ 组装 /api/v1/notes/* 请求，in-process 执行
        ▼
APIV1Service（REST / Connect / gRPC-Gateway）
  ├── 权限校验（私有 / 共享文件夹）
  ├── 双链与标签解析
  └── 文档 CRUD 与导入导出
        │
        ▼
store.Store → SQLite / MySQL / PostgreSQL
```

分层职责：

| 层 | 职责 | 是否新增 |
| --- | --- | --- |
| `store/` | 持久化、事务、三驱动 SQL | 否 |
| `server/router/api/v1` | 业务权威：权限、双链、标签、CRUD | 仅可选小重构 |
| `server/router/mcp` | 参数翻译、Agent 寻址、结果整形 | 是（新增 notes_tools.go） |
| 前端 | Markdown 渲染、Live Preview | 否 |

## 7. MCP 工具设计

### 7.1 工具清单

第一版工具集，命名沿用现有 `memo_*` 风格：

| MCP 工具 | 作用 | 内部映射 |
| --- | --- | --- |
| `note_list` | 列出文档，支持 folder / tag / title_search / order_by / 分页 | `GET /api/v1/notes` |
| `note_read` | 按 name 或 title 读取一篇文档，返回 Markdown 原文 | `GET /api/v1/notes/{uid}` |
| `note_create` | 新建文档（title / content / folder） | `POST /api/v1/notes` |
| `note_update` | 更新文档，title / content / folder 任一可选，自动生成 updateMask | `PATCH /api/v1/notes/{uid}` |
| `note_delete` | 删除文档 | `DELETE /api/v1/notes/{uid}` |
| `note_search` | 搜索文档（标题模糊 + 标签过滤） | `GET /api/v1/notes?titleSearch=&tag=` |
| `note_export` | 导出 Markdown 原文 | `GET /api/v1/notes/{uid}:export` |
| `note_folder_list` | 列出文件夹（可选，第一版建议只做只读） | `GET /api/v1/note_folders` |

### 7.2 输入与输出

`note_read` 输入示例：

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "资源名，格式 notes/{uid}" },
    "title": { "type": "string", "description": "文档标题，与 name 二选一" }
  },
  "additionalProperties": false
}
```

`note_update` 输入示例：

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "title": { "type": "string" },
    "content": { "type": "string", "description": "Markdown 原文" },
    "folder": { "type": "string", "description": "目标文件夹资源名，空字符串表示移动到根目录" }
  },
  "additionalProperties": false
}
```

输出统一使用现有 `result.go` 的 object-shaped 规则：

- `note_read` / `note_create` / `note_update` 返回文档对象（name / title / content / update_time 等）。
- `note_list` / `note_search` / `note_folder_list` 返回 `{ "result": [...] }` 包装的数组。
- `note_delete` 返回 `{ "ok": true }`。

### 7.3 寻址规则

`note_read` / `note_update` / `note_delete` / `note_export` 接受 `name` 或 `title`：

1. `name` 非空时直接使用资源名，不做二次查询。
2. 否则调用 `GET /api/v1/notes?titleSearch=<title>`，在结果中过滤出标题完全相等的文档。
3. 唯一命中则继续；多个命中返回候选列表并提示 Agent 使用 `name` 指定；零命中返回明确的 not found 错误。

该规则对当前 API 不需要新增字段；如果后续发现 Agent 频繁按标题定位，再考虑在 proto 中增加精确标题查询参数。

### 7.4 关键行为约定

- `note_update` 永不向 Agent 暴露 `updateMask`；MCP 层根据传入字段自动构造 `FieldMask`。
- `note_create` 直接映射 `POST /api/v1/notes`，不隐式重命名；重复标题行为与前端保持一致。
- 若后续需要“导入式创建”（标题重名自动加序号），再暴露 `note_import` 映射到现有 `ImportNote`。
- `note_export` 返回 `{ title, content }`，由 Agent 自行决定如何渲染 Markdown；MCP 不承担渲染职责。
- 第一版不暴露 `note_link`、`note_stats` 等面向 UI 的辅助接口；双链数据仍随 `note_read` 返回。

## 8. 数据流

以 `note_update` 为例：

1. Agent 调用 `note_update`，传入 `title` 与 `content`。
2. MCP handler 按寻址规则解析出 `notes/{uid}`。
3. MCP handler 构造 `PATCH /api/v1/notes/{uid}` 请求，body 为 `{ "note": { "name": "...", "content": "..." }, "updateMask": { "paths": ["content"] } }`。
4. 请求通过 `apiAdapter` 在进程内执行，转发 Agent 的 `Authorization`。
5. `APIV1Service.UpdateNote` 完成权限校验、正文更新、双链/标签重算。
6. MCP 将响应规范化为 object-shaped `structuredContent` 返回。

## 9. 认证与权限

- MCP 客户端使用 `Authorization: Bearer <PAT 或访问令牌>`，与现有 `/mcp` 行为一致。
- 文档可见性由 REST API 强制执行：私有文档仅创建者，共享文件夹内的文档对全实例注册用户开放。
- MCP 层不做任何独立鉴权判断，不复制 `checkNoteAccess` 逻辑。
- `isAllowedMCPOrigin` 的 Origin 校验保持不变。

## 10. 错误处理

- 鉴权失败、权限不足、资源不存在时，保留 API 的 401 / 403 / 404 消息。
- 按 title 定位时多个命中属于歧义错误，返回候选列表，不使用“取第一个”的静默策略。
- 参数校验错误返回简洁的 MCP tool error，不抛 JSON-RPC 协议级错误。
- 现有 `newToolErrorResult` / `newStructuredToolResult` 继续复用。

## 11. 服务层小重构建议

以下改动不阻塞 MCP 工具开发，但能解决 3.3 中的一致性与重复问题，建议按优先级推进：

### 11.1 原子保存（P1）

把“更新 note + 重算 note_link / note_tag”合并为单个事务操作，例如在 store 层新增 `UpdateNoteWithRelations`，三驱动分别实现；失败时整体回滚，避免正文与关系表不一致。

### 11.2 权限上下文抽取（P2）

将 `listNoteFoldersMap`、`ListSharedNoteFolderIDs`、`fetchCurrentUser` 组合为一次性的 `noteAccessContext`，供 CRUD handler 复用，减少每个请求的全量文件夹加载次数。

### 11.3 MCP 工具注册通道（P1，必须）

在 `server/router/mcp/service.go` 中支持“自定义语义工具”与 OpenAPI 派生工具并列注册：

- 新增 `notes_tools.go` 定义工具与 handler。
- handler 复用 `apiAdapter`，必要时为 `apiAdapter` 增加通用 `executeRequest` 方法。
- `mcp` 包不直接访问 store，不复制业务逻辑。

## 12. 测试策略

### 后端

- 工具定义测试：schema、描述、命名唯一、annotations 正确。
- 寻址测试：name 优先、title 唯一命中、title 多命中返回候选、title 零命中报错。
- 请求映射测试：`note_update` 自动生成 updateMask、folder 空字符串映射为移动到根目录。
- 端到端 `tools/call`：create -> read -> update -> delete 全链路。
- 权限测试：私有文档不可被其他用户读取，共享文件夹文档可被读取。
- 回归：现有 memo/attachment 工具不受影响。

运行：

```bash
go test ./server/router/mcp/...
go test -v -race ./server/...
```

### 前端

本设计不修改前端，仅需确认现有 Notes 页面在 API 未变的前提下保持通过：

```bash
cd web && pnpm lint && pnpm test
```

## 13. 落地顺序

1. T1：编写本设计文档（本文档）。
2. T2：扩展 `server/router/mcp`，增加自定义工具注册通道。
3. T3：实现 `notes_tools.go` 的 7 个工具与 REST 映射。
4. T4：补齐单元测试与端到端 MCP 测试。
5. T5：可选执行 11.1 原子保存重构。
6. T6：若确认需要全文搜索，再扩展 proto 与 store。

## 14. 待确认决策点

1. Agent 定位文档：只认 `notes/{uid}`，还是采用本文推荐的 `name` / `title` 双寻址？
2. 是否需要正文全文搜索？当前只有标题模糊 + 标签过滤，全文搜索需要新增 proto field 与 store 实现。
3. 共享文件夹与双链能力在第一版保留，还是仅做纯 Markdown 文档 CRUD？
4. 是否需要 MCP resources（把文档暴露为可浏览资源）？推荐第一版保持 tools-only。
5. 是否需要类 Obsidian 的路径语义（如 `folder/title`）？当前模型是 folder + title，无路径字段。

## 15. 相关文件

| 文件 | 说明 |
| --- | --- |
| `proto/api/v1/note_service.proto` | 现有 NoteService / NoteFolderService 契约 |
| `server/router/api/v1/note_service.go` | 现有文档业务实现 |
| `server/router/api/v1/note_service_converter.go` | 权限、双链解析、转换逻辑 |
| `server/router/mcp/service.go` | MCP 服务注册入口（需要扩展） |
| `server/router/mcp/catalog.go` | OpenAPI 派生工具 allowlist（本设计不扩展它） |
| `server/router/mcp/adapter.go` | 工具调用到 REST 请求的适配（需要复用/扩展） |
| `server/router/mcp/result.go` | 结果规范化（复用） |
| `store/note.go` | 文档存储门面 |
| `web/src/hooks/useNoteQueries.ts` | 前端消费的 React Query hooks |
