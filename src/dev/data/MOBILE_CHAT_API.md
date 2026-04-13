# AIYOU 移动端聊天接口文档

> 适用场景：移动端聊天页面对接，包含会话、线程、消息、记忆的完整增删改查
> 网关基础 URL：`http://<host>:2026`
> API 前缀：`/api`
> 更新时间：2026-04-10

---

## 目录

- [核心流程](#核心流程)
  - [A. 私人模式对话聊天](#a-私人模式对话聊天)
  - [B. 决策模式对话聊天](#b-决策模式对话聊天)
  - [C. 记忆内容展示与管理](#c-记忆内容展示与管理)
- [认证说明](#认证说明)
1. [会话管理 Sessions](#1-会话管理-sessions)
2. [对话线程 Threads](#2-对话线程-threads)
3. [消息发送 Runs（流式/阻塞）](#3-消息发送-runs)
4. [记忆管理 Memory](#4-记忆管理-memory)
5. [管理员记忆 Admin Memory](#5-管理员记忆-admin-memory)
6. [文件上传 Uploads](#6-文件上传-uploads)
7. [制品获取 Artifacts](#7-制品获取-artifacts)
8. [后续建议 Suggestions](#8-后续建议-suggestions)
9. [模型列表 Models](#9-模型列表-models)
10. [认证接口 Auth](#10-认证接口-auth)
11. [统一错误码](#统一错误码)

---

## 核心流程

本节给出三个核心业务场景的**完整接口调用序列**（含完整 Headers 和 Request/Response Body），可直接按步骤实现。

---

### 记忆机制说明

在阅读具体流程前，先理解记忆的两个方向：

**读记忆（参考记忆）** — 在 `runs/stream` / `runs/wait` 被调用时，**服务端全自动**注入，前端无需额外操作：

```
context.user_id + tenant_id + workspace_id
    ↓ merge_tenancy_mappings()
MemoryScope.from_tenancy()   → 定位该用户的记忆文件
    ↓ format_memory_for_injection()
<memory>…</memory>           → 注入系统提示，AI 带着记忆回复
```

**写记忆（自动更新）** — 每次 Agent 回复完成后，**后台异步**触发，前端无感知：

```
MemoryMiddleware.after_agent()
    ↓ 过滤消息（只保留 human + 最终 ai，去掉工具调用和文件路径）
queue.add(thread_id, messages)   → 防抖队列，30 秒内同线程只处理最新一次
    ↓ 后台线程调用 LLM
提取 facts / 更新 context       → 原子写入 memory.json
```

> **关键**：只要 `runs/stream` / `runs/wait` 的 `context` 字段包含 `user_id` + `tenant_id` + `workspace_id`，记忆读写全自动发生，**不需要单独调用任何 `/api/memory` 接口**。

---

### A. 私人模式对话聊天

#### 概述

私人模式是一对一的流式对话，使用 **SSE（Server-Sent Events）** 实时推送 AI 回复。每次对话绑定一个 `thread_id`，历史消息持久化在服务端，支持多轮上下文。

支持以下子模式，通过 `context` 字段区分：

| 子模式 | `thinking_enabled` | `is_plan_mode` | `subagent_enabled` | 说明 |
|--------|--------------------|----------------|--------------------|------|
| flash    | `false` | `false` | `false` | 快速回复 |
| thinking | `true`  | `false` | `false` | 深度思考 |
| pro      | `true`  | `true`  | `false` | 计划模式 |
| ultra    | `true`  | `true`  | `true`  | 多子 Agent 协同 |

#### 完整调用流程

```
Step 1   登录，获取 token + user_id + tenant_id + workspace_id
Step 2   创建对话线程（新对话执行，续聊跳到 Step 4）
Step 3   上传附件（可选，有文件才调用）
Step 4 ⭐ 发送消息（SSE 流式）—— 记忆在这里自动读写
Step 5   注册会话绑定（后台 fire-and-forget）
Step 6   持久化对话标题（检测到 SSE updates 含 title 后调用）
Step 7   获取后续建议（可选）
Step 8   加载历史对话列表
Step 9   加载历史消息（进入已有对话时）
Step 10  删除对话
```

---

**Step 1 — 登录**

```http
POST /api/auth/user-login
Content-Type: application/json
```

```json
// Request
{
  "username": "demo",
  "password": "Demo@123456"
}
```

```json
// Response — 保存以下四个字段，后续所有请求都要用
{
  "token":        "eyJhbGciOiJIUzI1NiJ9.xxx",
  "user_id":      "user_123",
  "tenant_id":    "tenant_001",
  "workspace_id": "ws_001",
  "username":     "demo",
  "display_name": "Demo User",
  "roles":        ["user"]
}
```

> 从此步开始，**后续每个请求**都携带以下 Headers：
> ```
> Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.xxx
> X-User-ID:      user_123
> X-Tenant-ID:    tenant_001
> X-Workspace-ID: ws_001
> Content-Type:   application/json
> ```

---

**Step 2 — 创建对话线程**（新对话）

```http
POST /api/threads
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request
{
  "metadata": {
    "user_id": "user_123",
    "title":   "新对话"
  }
}
```

```json
// Response
{
  "thread_id":  "t-aaa-111",
  "status":     "idle",
  "created_at": "2026-04-10T10:00:00Z",
  "metadata":   { "user_id": "user_123", "title": "新对话" },
  "values":     {}
}
```

> 保存 `thread_id = "t-aaa-111"`，后续所有接口均需要它。

---

**Step 3 — 上传附件**（可选，有文件才调用）

```http
POST /api/threads/t-aaa-111/uploads
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: multipart/form-data
```

```
files=@report.pdf
```

```json
// Response
{
  "success": true,
  "files": [
    {
      "filename":             "report.pdf",
      "size":                 "102400",
      "virtual_path":         "/mnt/user-data/uploads/report.pdf",
      "markdown_virtual_path":"/mnt/user-data/uploads/report.md"
    }
  ]
}
```

> 保存 `virtual_path`，在 Step 4 的消息 `additional_kwargs.files` 中引用。

---

**Step 4 ⭐ — 发送消息（SSE 流式）—— 记忆在此步自动注入**

```http
POST /api/threads/t-aaa-111/runs/stream
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

**纯文字消息：**

```json
{
  "input": {
    "messages": [
      {
        "type": "human",
        "content": [{ "type": "text", "text": "帮我分析最近的 AI 发展趋势" }]
      }
    ]
  },
  "config": { "recursion_limit": 1000 },
  "context": {
    "user_id":         "user_123",
    "tenant_id":       "tenant_001",
    "workspace_id":    "ws_001",
    "thread_id":       "t-aaa-111",
    "model_name":      "claude-sonnet-4-6",
    "thinking_enabled": false,
    "is_plan_mode":     false,
    "subagent_enabled": false
  },
  "stream_mode":        ["values", "updates"],
  "stream_subgraphs":   true,
  "stream_resumable":   true,
  "multitask_strategy": "enqueue",
  "on_disconnect":      "cancel"
}
```

**携带附件的消息（Step 3 上传后）：**

```json
{
  "input": {
    "messages": [
      {
        "type": "human",
        "content": [{ "type": "text", "text": "分析这份报告的核心结论" }],
        "additional_kwargs": {
          "files": [
            {
              "filename": "report.pdf",
              "size":     102400,
              "path":     "/mnt/user-data/uploads/report.pdf",
              "status":   "uploaded"
            }
          ]
        }
      }
    ]
  },
  "config": { "recursion_limit": 1000 },
  "context": {
    "user_id":         "user_123",
    "tenant_id":       "tenant_001",
    "workspace_id":    "ws_001",
    "thread_id":       "t-aaa-111",
    "model_name":      "claude-sonnet-4-6",
    "thinking_enabled": false,
    "is_plan_mode":     false,
    "subagent_enabled": false
  },
  "stream_mode":        ["values", "updates"],
  "stream_subgraphs":   true,
  "stream_resumable":   true,
  "multitask_strategy": "enqueue",
  "on_disconnect":      "cancel"
}
```

**SSE 响应流（`text/event-stream`）：**

```
event: metadata
data: {"run_id": "run-xyz-001"}

event: updates
data: {"lead_agent": {"title": "AI发展趋势分析"}}

event: values
data: {
  "messages": [
    {"type": "human", "content": "帮我分析最近的 AI 发展趋势"},
    {"type": "ai",    "content": "近年来 AI 在以下几个方向发展迅速..."}
  ],
  "title": "AI发展趋势分析"
}

event: end
data: {}
```

**SSE 处理逻辑：**

| 事件 | 处理方式 |
|------|---------|
| `metadata` | 保存 `run_id`，备用 |
| `updates` 含 `title` | 立即更新本地标题显示，并触发 Step 6 持久化 |
| `values` | 取 `messages` 中最后一条 `type=ai` 的消息渲染回复内容 |
| `end` | 流结束，隐藏加载状态 |

**记忆在此步的工作方式（服务端自动，前端无感知）：**

```
请求到达服务端
  ↓ make_lead_agent 读取 context.user_id = "user_123"
  ↓ 加载 user_123 的 memory.json → 注入 <memory> 标签到系统提示
  ↓ AI 带着用户记忆执行并回复（通过 SSE 推送）
  ↓ 回复完成后 30s 后台异步：LLM 分析本次对话 → 更新 memory.json
```

---

**Step 5 — 注册会话绑定**（后台 fire-and-forget，不阻塞 UI）

在 Step 4 发出后异步调用，失败不影响对话功能。

```http
POST /api/sessions
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request
{
  "thread_id":    "t-aaa-111",
  "user_id":      "user_123",
  "tenant_id":    "tenant_001",
  "workspace_id": "ws_001"
}
```

```json
// Response
{
  "session_id":  "sess-bbb-222",
  "thread_id":   "t-aaa-111",
  "user_id":     "user_123",
  "status":      "active",
  "created_at":  "2026-04-10T10:00:00Z"
}
```

---

**Step 6 — 持久化对话标题**（检测到 SSE `updates` 含 `title` 后触发）

防止页面刷新后标题丢失，需同步到服务端 Store。

```http
POST /api/threads/t-aaa-111/state
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request
{
  "values": { "title": "AI发展趋势分析" }
}
```

```json
// Response
{
  "values":        { "title": "AI发展趋势分析", "messages": ["..."] },
  "checkpoint_id": "chk-001"
}
```

---

**Step 7 — 获取后续建议**（可选）

```http
POST /api/threads/t-aaa-111/suggestions
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request
{
  "messages": [
    { "role": "user",      "content": "帮我分析最近的 AI 发展趋势" },
    { "role": "assistant", "content": "近年来 AI 在以下几个方向发展迅速..." }
  ],
  "n": 3
}
```

```json
// Response
{
  "suggestions": [
    "AI 在医疗领域有哪些具体应用？",
    "大模型的训练成本趋势如何？",
    "开源模型与商业模型相比有什么优势？"
  ]
}
```

---

**Step 8 — 加载历史对话列表**

```http
POST /api/threads/search
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request
{
  "metadata": { "user_id": "user_123" },
  "limit":  50,
  "offset": 0
}
```

```json
// Response（数组，按 updated_at 倒序）
[
  {
    "thread_id":  "t-aaa-111",
    "status":     "idle",
    "updated_at": "2026-04-10T10:05:00Z",
    "metadata":   { "user_id": "user_123" },
    "values":     { "title": "AI发展趋势分析" }
  },
  {
    "thread_id":  "t-bbb-222",
    "status":     "idle",
    "updated_at": "2026-04-09T15:00:00Z",
    "values":     { "title": "Python 代码优化" }
  }
]
```

---

**Step 9 — 加载历史消息**（进入已有对话时）

```http
GET /api/threads/t-aaa-111/state
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
```

```json
// Response
{
  "values": {
    "title": "AI发展趋势分析",
    "messages": [
      {
        "type":    "human",
        "content": [{ "type": "text", "text": "帮我分析最近的 AI 发展趋势" }]
      },
      {
        "type":    "ai",
        "content": "近年来 AI 在以下几个方向发展迅速..."
      }
    ]
  },
  "checkpoint_id": "chk-001"
}
```

---

**Step 10 — 删除对话**

```http
DELETE /api/threads/t-aaa-111
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
```

```json
// Response
{
  "success": true,
  "message": "Deleted local thread data for t-aaa-111"
}
```

#### 接口速查

| 步骤 | 方法 | 路径 | 说明 |
|------|------|------|------|
| Step 1 | POST | `/api/auth/user-login` | 登录，获取 token + 用户身份 |
| Step 2 | POST | `/api/threads` | 新对话必须，获取 thread_id |
| Step 3 | POST | `/api/threads/{id}/uploads` | 有附件时必须，获取 virtual_path |
| **Step 4 ⭐** | **POST** | **`/api/threads/{id}/runs/stream`** | **核心：SSE 流式，context 携带用户身份触发记忆** |
| Step 5 | POST | `/api/sessions` | 后台 fire-and-forget |
| Step 6 | POST | `/api/threads/{id}/state` | SSE 检测到 title 后同步 |
| Step 7 | POST | `/api/threads/{id}/suggestions` | 可选，生成推荐问题 |
| Step 8 | POST | `/api/threads/search` | metadata.user_id 过滤 |
| Step 9 | GET  | `/api/threads/{id}/state` | 进入历史对话时加载消息 |
| Step 10 | DELETE | `/api/threads/{id}` | 删除对话 |

---

### B. 决策模式对话聊天

#### 概述

决策模式与私人模式的核心区别：

| 对比项 | 私人模式 | 决策模式 |
|--------|----------|----------|
| 线程数 | 1 个 | N 个（每个 Coach 1 个）|
| 接口 | `runs/stream`（SSE 流式）| `runs/wait`（阻塞等待）|
| 并发 | 串行 | 所有 Coach 并行（Promise.all）|
| 系统提示 | 通用 Agent 提示 | 通用提示 + `custom_system_prompt` |
| 记忆注入 | 同一份记忆注入单个 Agent | **同一份记忆分别注入每个 Coach**，各 Coach 从不同角度解读 |

**记忆注入机制在决策模式中同样全自动**：每个 `runs/wait` 的 `context` 携带相同的 `user_id`，服务端为每个 Coach 独立读取该用户记忆并注入其系统提示。

#### 完整调用流程

```
Step 1   登录，获取 token + user_id + tenant_id + workspace_id
Step 2   为每个 Coach 懒创建线程（已有则复用，持久化 coachId→threadId 映射）
Step 3 ⭐ 并发阻塞发送（所有 Coach 并行）—— 记忆在这里自动注入每个 Coach
Step 4   从 runs/wait 响应或 /state 接口提取各 Coach 最终回复
Step 5   （可选）自动生成决策标题
Step 6   加载决策对话列表
Step 7   删除 Coach 线程
```

---

**Step 1 — 登录**（同私人模式 Step 1，略）

---

**Step 2 — 为每个 Coach 懒创建线程**

每个 Coach 在**首次发消息时**创建对应线程，已有 `coachThreadId` 则跳过直接复用。

```http
POST /api/threads
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request（每个 Coach 调用一次，coach_id 字段不同）
{
  "metadata": {
    "user_id":           "user_123",
    "is_decision_coach": "true",
    "coach_id":          "coach_rationalist"
  }
}
```

```json
// Response
{
  "thread_id": "t-coach-rationalist-001",
  "status":    "idle",
  "metadata":  { "user_id": "user_123", "is_decision_coach": "true", "coach_id": "coach_rationalist" }
}
```

> 假设选了 3 个 Coach，创建 3 次，得到：
> - `coach_rationalist` → `t-coach-rationalist-001`
> - `coach_empathetic`  → `t-coach-empathetic-001`
> - `coach_creative`    → `t-coach-creative-001`
>
> 将 `{ coachId → threadId }` 持久化到本地存储，下次进入同一对话时复用，延续上下文。

---

**Step 3 ⭐ — 并发阻塞发送（所有 Coach 并行）—— 记忆在此自动注入**

对每个 Coach 线程**并发调用**（`Promise.all`），每次都携带用户身份和该 Coach 的角色提示。

**Coach 1 — 理性分析师：**

```http
POST /api/threads/t-coach-rationalist-001/runs/wait
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
{
  "assistant_id": "lead_agent",
  "input": {
    "messages": [
      { "type": "human", "content": "我应该跳槽去创业公司还是留在大厂？" }
    ]
  },
  "config": { "recursion_limit": 100 },
  "context": {
    "user_id":         "user_123",
    "tenant_id":       "tenant_001",
    "workspace_id":    "ws_001",
    "thread_id":       "t-coach-rationalist-001",
    "model_name":      "claude-sonnet-4-6",
    "thinking_enabled": false,
    "is_plan_mode":     false,
    "subagent_enabled": false,
    "custom_system_prompt": "你是一位理性分析师。请从薪资数据、职业发展机会、行业趋势、风险概率等客观维度分析用户的问题，给出逻辑清晰的建议。"
  }
}
```

**Coach 2 — 情感共情师（同时并发）：**

```http
POST /api/threads/t-coach-empathetic-001/runs/wait
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
{
  "assistant_id": "lead_agent",
  "input": {
    "messages": [
      { "type": "human", "content": "我应该跳槽去创业公司还是留在大厂？" }
    ]
  },
  "config": { "recursion_limit": 100 },
  "context": {
    "user_id":         "user_123",
    "tenant_id":       "tenant_001",
    "workspace_id":    "ws_001",
    "thread_id":       "t-coach-empathetic-001",
    "model_name":      "claude-sonnet-4-6",
    "thinking_enabled": false,
    "is_plan_mode":     false,
    "subagent_enabled": false,
    "custom_system_prompt": "你是一位情感共情师。请关注用户的内心感受、工作满意度和生活平衡，从人文关怀角度给出温暖有力的建议。"
  }
}
```

**Coach 3 — 创新思维师（同时并发）：**

```http
POST /api/threads/t-coach-creative-001/runs/wait
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
{
  "assistant_id": "lead_agent",
  "input": {
    "messages": [
      { "type": "human", "content": "我应该跳槽去创业公司还是留在大厂？" }
    ]
  },
  "config": { "recursion_limit": 100 },
  "context": {
    "user_id":         "user_123",
    "tenant_id":       "tenant_001",
    "workspace_id":    "ws_001",
    "thread_id":       "t-coach-creative-001",
    "model_name":      "claude-sonnet-4-6",
    "thinking_enabled": false,
    "is_plan_mode":     false,
    "subagent_enabled": false,
    "custom_system_prompt": "你是一位创新思维师。请打破常规，提出用户可能没想到的第三条路或创造性解决方案，挑战固有假设。"
  }
}
```

**`runs/wait` 响应**（阻塞，等待 AI 完成后才返回）：

```json
{
  "messages": [
    { "type": "human", "content": "我应该跳槽去创业公司还是留在大厂？" },
    { "type": "ai",    "content": "从理性角度分析，当前大厂薪资中位数..." }
  ],
  "title": "跳槽决策分析"
}
```

> **记忆注入在此发生（服务端自动）**：每个 Coach 的 `runs/wait` 请求均携带 `user_id=user_123`，服务端读取该用户记忆注入各 Coach 的系统提示。相同的用户记忆，不同的 Coach 角色视角，产生多元化建议。

---

**Step 4 — 提取各 Coach 最终回复**

`runs/wait` 直接返回最终 `messages`，从中提取即可。如需完整状态也可调用 `/state`：

```http
GET /api/threads/t-coach-rationalist-001/state
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
```

```json
// Response
{
  "values": {
    "messages": [
      { "type": "human", "content": "我应该跳槽去创业公司还是留在大厂？" },
      { "type": "ai",    "content": "从理性角度分析，当前大厂薪资中位数..." }
    ]
  }
}
```

**解析逻辑：**

```javascript
// 取最后一条 type=ai 的消息
const lastAI = [...messages].reverse().find(m => m.type === "ai")

// 特殊情况：Coach 要求用户补充信息
if (!extractText(lastAI.content) && lastAI.tool_calls?.length) {
  const clarification = lastAI.tool_calls.find(tc => tc.name === "ask_clarification")
  if (clarification) {
    // needsHelp = true
    // 展示 clarification.args.question 和 clarification.args.options
  }
}
```

---

**Step 5 — 自动生成决策标题**（可选）

```http
// 5a. 创建临时线程
POST /api/threads
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json

{"metadata": {"is_decision_title_gen": "true"}}
// → 得到 temp_thread_id = "t-tmp-999"
```

```http
// 5b. 阻塞运行，生成标题
POST /api/threads/t-tmp-999/runs/wait
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
{
  "assistant_id": "lead_agent",
  "input": {
    "messages": [
      { "type": "human", "content": "我应该跳槽去创业公司还是留在大厂？" }
    ]
  },
  "config": { "recursion_limit": 10 },
  "context": {
    "user_id":         "user_123",
    "tenant_id":       "tenant_001",
    "workspace_id":    "ws_001",
    "thread_id":       "t-tmp-999",
    "thinking_enabled": false,
    "is_plan_mode":     false,
    "subagent_enabled": false,
    "custom_system_prompt": "请根据用户的问题，生成一个简洁的中文标题（不超过15个字，直接输出标题，不加任何引号、括号或其他符号）。"
  }
}
```

```http
// 5c. 读取标题（取最后一条 type=ai 消息的 content）
GET /api/threads/t-tmp-999/state
Authorization: Bearer <token>
X-User-ID: user_123
```

```http
// 5d. 删除临时线程（立即清理）
DELETE /api/threads/t-tmp-999
Authorization: Bearer <token>
X-User-ID: user_123
```

---

**Step 6 — 加载决策对话列表**

```http
POST /api/threads/search
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
{
  "metadata": { "user_id": "user_123", "is_decision_coach": "true" },
  "limit": 50,
  "offset": 0
}
```

---

**Step 7 — 删除 Coach 线程**（逐一调用）

```http
DELETE /api/threads/t-coach-rationalist-001
DELETE /api/threads/t-coach-empathetic-001
DELETE /api/threads/t-coach-creative-001
Authorization: Bearer <token>
X-User-ID: user_123
```

#### 接口速查

| 步骤 | 方法 | 路径 | 说明 |
|------|------|------|------|
| Step 2 | POST | `/api/threads` | 每个 Coach 懒创建一次，持久化 coachId→threadId |
| **Step 3 ⭐** | **POST** | **`/api/threads/{id}/runs/wait`** | **核心：并发阻塞，context 携带用户身份触发记忆** |
| Step 4 | GET  | `/api/threads/{id}/state` | 可选，runs/wait 已含 messages |
| Step 5a | POST | `/api/threads` | 临时线程，metadata 标记 is_decision_title_gen |
| Step 5b | POST | `/api/threads/{id}/runs/wait` | 阻塞运行，custom_system_prompt 生成标题 |
| Step 5c | GET  | `/api/threads/{id}/state` | 取最后 ai 消息作为标题 |
| Step 5d | DELETE | `/api/threads/{id}` | 立即删除临时线程 |
| Step 6 | POST | `/api/threads/search` | metadata 过滤 is_decision_coach=true |
| Step 7 | DELETE | `/api/threads/{id}` | 逐一删除所有 Coach 线程 |

---

### C. 记忆内容展示与管理

#### 概述

记忆面板是对记忆数据的**手动管理界面**，与对话流完全独立。对话中的记忆读写由服务端自动处理（见上方记忆机制说明），记忆面板仅用于用户主动查看和管理。

记忆分类（`category`）：

| 值 | 含义 |
|----|------|
| `preference` | 偏好（语言偏好、回答风格、工具选择）|
| `knowledge`  | 知识背景（技能、领域专长）|
| `context`    | 当前上下文（正在进行的项目、职位）|
| `behavior`   | 行为习惯（工作方式、沟通习惯）|
| `goal`       | 目标与计划 |
| `correction` | 纠错记录（AI 曾经犯过的错误，防止重蹈）|

---

**加载全量记忆**

```http
GET /api/memory
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
```

```json
// Response
{
  "version":     "1.0",
  "lastUpdated": "2026-04-10T10:05:00Z",
  "user": {
    "workContext":    { "summary": "用户是全栈工程师，正在开发移动端 AI 应用",       "updatedAt": "2026-04-10T10:05:00Z" },
    "personalContext":{ "summary": "偏好简洁直接的回答风格，擅长 TypeScript 和 Python", "updatedAt": "2026-04-10T09:00:00Z" },
    "topOfMind":     { "summary": "近期专注于移动端 API 对接，研究 LangGraph 和 SSE 流式协议", "updatedAt": "2026-04-10T10:05:00Z" }
  },
  "history": {
    "recentMonths":       { "summary": "近期讨论了 API 文档设计、记忆注入机制和决策模式实现", "updatedAt": "2026-04-10T10:05:00Z" },
    "earlierContext":     { "summary": "曾深度研究过数据库优化和后端架构设计",             "updatedAt": "2026-04-08T12:00:00Z" },
    "longTermBackground": { "summary": "全栈工程师，10 年经验，熟悉 Python、TypeScript、React", "updatedAt": "2026-01-01T00:00:00Z" }
  },
  "facts": [
    {
      "id":         "fact_abc123",
      "content":    "用户偏好使用 TypeScript 而非 JavaScript",
      "category":   "preference",
      "confidence": 0.95,
      "createdAt":  "2026-04-10T10:00:00Z",
      "source":     "conversation"
    },
    {
      "id":         "fact_def456",
      "content":    "用户在开发 AIYOU 移动端项目",
      "category":   "context",
      "confidence": 0.90,
      "createdAt":  "2026-04-10T09:00:00Z",
      "source":     "conversation"
    }
  ]
}
```

> 渲染建议：
> - `user.workContext / personalContext / topOfMind` 展示为摘要卡片。
> - `facts` 列表按 `category` 分组，展示可编辑条目。
> - `source=conversation` 为 AI 自动提取，`source=manual` 为用户手动添加。

---

**新增记忆事实**

```http
POST /api/memory/facts
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request
{
  "content":    "用户不喜欢冗长的代码注释，偏好自注释代码",
  "category":   "preference",
  "confidence": 0.9
}
// Response：返回更新后的完整 MemoryResponse（含新增的 fact）
```

---

**编辑记忆事实**

```http
PATCH /api/memory/facts/fact_abc123
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
Content-Type: application/json
```

```json
// Request（至少传一个字段）
{
  "content":    "用户强烈偏好 TypeScript，尤其在大型项目中",
  "confidence": 0.98
}
// Response：返回更新后的完整 MemoryResponse
```

---

**删除单条记忆**

```http
DELETE /api/memory/facts/fact_def456
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
```

```json
// Response：返回移除该 fact 后的完整 MemoryResponse
```

---

**清空全部记忆**（危险操作，建议二次确认）

```http
DELETE /api/memory
Authorization: Bearer <token>
X-User-ID: user_123
X-Tenant-ID: tenant_001
X-Workspace-ID: ws_001
```

```json
// Response
{
  "version": "1.0",
  "lastUpdated": "2026-04-10T10:30:00Z",
  "user": {},
  "history": {},
  "facts": []
}
```

#### 接口速查

| 操作 | 方法 | 路径 | 说明 |
|------|------|------|------|
| **加载记忆面板** | **GET** | **`/api/memory`** | **⭐ 携带用户身份 Headers** |
| 新增事实 | POST | `/api/memory/facts` | 用户手动添加，source 标记为 manual |
| 编辑事实 | PATCH | `/api/memory/facts/{id}` | 至少传 content / category / confidence 之一 |
| 删除单条 | DELETE | `/api/memory/facts/{id}` | 立即生效 |
| 清空记忆 | DELETE | `/api/memory` | ⚠️ 危险，建议二次确认弹窗 |
| 分层记忆 | GET | `/api/memory/layered` | 查看各层（agent_private / workspace_shared）|
| 记忆状态 | GET | `/api/memory/status` | 返回配置 + 数据，调试用 |
| 导出备份 | GET | `/api/memory/export` | 导出完整 JSON 供用户保存 |
| 导入恢复 | POST | `/api/memory/import` | 导入备份，覆盖当前记忆 |

---

### D. 完整时序对比

```
【私人模式】

用户 → ① login → token + user_id + tenant_id + workspace_id
     → ② POST /api/threads → thread_id
     → ③ POST /api/threads/{id}/uploads（可选）→ virtual_path
     → ④ POST /api/threads/{id}/runs/stream
              │  context: { user_id, tenant_id, workspace_id, thread_id, ... }
              │
              ├─ [服务端] 读取 user_123 的 memory.json
              ├─ [服务端] 注入 <memory> 标签到系统提示
              ├─ AI 带着记忆执行 → SSE 推送回复
              └─ [服务端 30s 后台] LLM 分析对话 → 更新 memory.json
              │
     → ⑤ POST /api/sessions（fire-and-forget）
     → ⑥ POST /api/threads/{id}/state（检测到 title 后）
     → ⑦ POST /api/threads/{id}/suggestions（可选）


【决策模式】

用户 → ① login → token + user_id + tenant_id + workspace_id
     → ② POST /api/threads × N（每个 Coach 懒创建）
     → ③ 并发 POST /api/threads/{coachId}/runs/wait × N
              │  每个请求 context 携带相同 user_id + 不同 custom_system_prompt
              │
              ├─ [服务端] 3 个 Coach 线程独立读取同一份 memory.json
              ├─ [服务端] 各 Coach 从自己的角色视角理解用户记忆
              ├─ 3 个 AI 并行执行，阻塞等待全部完成
              └─ [服务端 30s 后台] 3 条线程各自触发记忆更新
              │
     → ④ 从 runs/wait 响应提取各 Coach 回复
     → ⑤ 生成标题（可选，临时线程 → runs/wait → /state → DELETE）


【关键差异：记忆在决策模式中的角色】

同一份记忆 → 理性 Coach 提取职业背景作数据支撑
           → 情感 Coach 提取沟通偏好作共情依据
           → 创新 Coach 提取用户目标找突破口
```

---

## 认证说明

所有接口均需携带认证信息，支持以下方式：

| 方式 | Header | 说明 |
|------|--------|------|
| Bearer Token | `Authorization: Bearer <token>` | 推荐方式 |
| 令牌头 | `X-Auth-Token: <token>` | 备用方式 |

多租户可选附加头：

| Header | 说明 |
|--------|------|
| `X-User-ID` | 用户 ID |
| `X-Tenant-ID` | 租户 ID |
| `X-Workspace-ID` | 工作区 ID |
| `X-Session-ID` | 会话 ID |

---

## 1. 会话管理 Sessions

**路由前缀**：`/api/sessions`

---

### 1.1 创建或更新会话

```
POST /api/sessions
```

**Body 参数**（`application/json`，全部可选）：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `session_id` | string | 否 | 自动生成 UUID | 会话 ID，可指定以实现幂等创建/更新 |
| `thread_id` | string | 否 | 自动生成 UUID | 关联的线程 ID |
| `tenant_id` | string | 否 | null | 租户 ID |
| `workspace_id` | string | 否 | null | 工作区 ID |
| `user_id` | string | 否 | null | 用户 ID |
| `assistant_id` | string | 否 | null | 助手/Agent ID |
| `metadata` | object | 否 | `{}` | 自定义扩展元数据 |

**请求示例**：
```json
{
  "tenant_id": "tenant_001",
  "workspace_id": "ws_001",
  "user_id": "user_123",
  "metadata": {
    "source": "mobile",
    "device": "ios"
  }
}
```

**响应示例**（200）：
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "thread_id": "550e8400-e29b-41d4-a716-446655440001",
  "tenant_id": "tenant_001",
  "workspace_id": "ws_001",
  "user_id": "user_123",
  "assistant_id": null,
  "metadata": { "source": "mobile", "device": "ios" },
  "status": "active",
  "created_at": "2026-04-09T10:00:00Z",
  "updated_at": "2026-04-09T10:00:00Z"
}
```

---

### 1.2 列出所有会话

```
GET /api/sessions
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `tenant_id` | string | 否 | null | 按租户筛选 |
| `workspace_id` | string | 否 | null | 按工作区筛选 |
| `user_id` | string | 否 | null | 按用户筛选 |

**响应示例**（200）：
```json
{
  "sessions": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "thread_id": "550e8400-e29b-41d4-a716-446655440001",
      "tenant_id": "tenant_001",
      "workspace_id": "ws_001",
      "user_id": "user_123",
      "status": "active",
      "created_at": "2026-04-09T10:00:00Z",
      "updated_at": "2026-04-09T10:00:00Z"
    }
  ]
}
```

---

### 1.3 获取单个会话

```
GET /api/sessions/{session_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 会话 ID |

**响应示例**（200）：返回单个会话对象，结构同 1.1。

---

### 1.4 通过 thread_id 查询会话

```
GET /api/sessions/by-thread/{thread_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**响应示例**（200）：
```json
{
  "thread_id": "550e8400-e29b-41d4-a716-446655440001",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "tenant_001",
  "workspace_id": "ws_001",
  "updated_at": "2026-04-09T10:00:00Z"
}
```

---

### 1.5 绑定会话与线程

```
POST /api/sessions/{session_id}/bind-thread
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 会话 ID |

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `thread_id` | string | **是** | — | 要绑定的线程 ID（不能为空） |
| `tenant_id` | string | 否 | null | 覆盖租户 ID |
| `workspace_id` | string | 否 | null | 覆盖工作区 ID |
| `user_id` | string | 否 | null | 覆盖用户 ID |
| `assistant_id` | string | 否 | null | 覆盖助手 ID |
| `metadata` | object | 否 | `{}` | 附加元数据 |

**请求示例**：
```json
{
  "thread_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

**响应示例**（200）：返回更新后的会话绑定对象。

---

### 1.6 回放会话历史

```
GET /api/sessions/{session_id}/replay
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 会话 ID |

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| `limit` | integer | 否 | 20 | 1 ~ 100 | 返回的检查点（消息快照）数量 |

**响应示例**（200）：
```json
{
  "session": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "thread_id": "550e8400-e29b-41d4-a716-446655440001"
  },
  "thread_id": "550e8400-e29b-41d4-a716-446655440001",
  "count": 3,
  "events": [
    {
      "checkpoint_id": "chk_001",
      "created_at": "2026-04-09T10:00:00Z",
      "metadata": {},
      "values": {
        "messages": [
          { "role": "user", "content": "你好" },
          { "role": "assistant", "content": "你好！有什么可以帮您？" }
        ]
      }
    }
  ]
}
```

---

## 2. 对话线程 Threads

**路由前缀**：`/api/threads`

---

### 2.1 创建线程

```
POST /api/threads
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `thread_id` | string | 否 | 自动生成 UUID | 自定义线程 ID |
| `metadata` | object | 否 | `{}` | 初始元数据（可存 user_id、title 等） |

**请求示例**：
```json
{
  "metadata": {
    "user_id": "user_123",
    "title": "新对话"
  }
}
```

**响应示例**（200）：
```json
{
  "thread_id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "idle",
  "created_at": "2026-04-09T10:00:00Z",
  "updated_at": "2026-04-09T10:00:00Z",
  "metadata": {
    "user_id": "user_123",
    "title": "新对话"
  },
  "values": {}
}
```

---

### 2.2 搜索 / 列出线程

```
POST /api/threads/search
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `metadata` | object | 否 | `{}` | 元数据精确匹配过滤器，例如 `{"user_id": "user_123"}` |
| `limit` | integer | 否 | 100 | 返回数量上限，范围 1 ~ 1000 |
| `offset` | integer | 否 | 0 | 分页偏移量 |
| `status` | string | 否 | null | 状态过滤：`idle` / `busy` / `interrupted` / `error` |

**请求示例**：
```json
{
  "metadata": { "user_id": "user_123" },
  "limit": 20,
  "offset": 0
}
```

**响应示例**（200）：
```json
[
  {
    "thread_id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "idle",
    "created_at": "2026-04-09T10:00:00Z",
    "updated_at": "2026-04-09T10:05:00Z",
    "metadata": { "user_id": "user_123", "title": "新对话" },
    "values": { "title": "新对话" }
  }
]
```

---

### 2.3 获取线程信息

```
GET /api/threads/{thread_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**响应示例**（200）：返回单个线程对象，结构同 2.1。

---

### 2.4 更新线程元数据（如修改标题）

```
PATCH /api/threads/{thread_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `metadata` | object | 否 | `{}` | 要合并更新的元数据，支持 `title`、`user_id` 等 |

**请求示例**：
```json
{
  "metadata": {
    "title": "修改后的标题"
  }
}
```

**响应示例**（200）：返回更新后的线程对象。

---

### 2.5 删除线程

```
DELETE /api/threads/{thread_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**响应示例**（200）：
```json
{
  "success": true,
  "message": "Deleted local thread data for 550e8400-e29b-41d4-a716-446655440001"
}
```

---

### 2.6 获取线程最新状态

```
GET /api/threads/{thread_id}/state
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**响应示例**（200）：
```json
{
  "values": {
    "messages": [
      { "role": "user", "content": "你好" },
      { "role": "assistant", "content": "你好！有什么可以帮您？" }
    ],
    "title": "新对话"
  },
  "next": [],
  "metadata": {},
  "checkpoint": {
    "id": "chk_001",
    "ts": "2026-04-09T10:05:00Z"
  },
  "checkpoint_id": "chk_001",
  "parent_checkpoint_id": null,
  "created_at": "2026-04-09T10:00:00Z",
  "tasks": []
}
```

---

### 2.7 更新线程状态（用于人机交互 HiL 恢复）

```
POST /api/threads/{thread_id}/state
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `values` | object | 否 | null | 要合并的通道值（如修改 title） |
| `checkpoint_id` | string | 否 | null | 要从哪个检查点分支 |
| `checkpoint` | object | 否 | null | 完整检查点对象 |
| `as_node` | string | 否 | null | 标记为哪个节点发出的更新 |

**响应示例**（200）：返回更新后的线程状态对象，结构同 2.6。

---

### 2.8 获取检查点历史

```
POST /api/threads/{thread_id}/history
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| `limit` | integer | 否 | 10 | 1 ~ 100 | 返回历史条目数量 |
| `before` | string | 否 | null | — | 分页游标（检查点 ID） |

**响应示例**（200）：
```json
[
  {
    "checkpoint_id": "chk_002",
    "parent_checkpoint_id": "chk_001",
    "metadata": { "step": 2 },
    "values": {
      "messages": [
        { "role": "user", "content": "你好" },
        { "role": "assistant", "content": "你好！有什么可以帮您？" }
      ]
    },
    "created_at": "2026-04-09T10:05:00Z",
    "next": []
  }
]
```

---

## 3. 消息发送 Runs

### 3.1 流式发送消息（SSE）⭐ 移动端主要接口

```
POST /api/threads/{thread_id}/runs/stream
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `assistant_id` | string | 否 | null | 指定 Agent/助手名称 |
| `input` | object | 否 | null | 输入内容，见下方详细说明 |
| `input.messages` | array | 否 | — | 消息列表，每项含 `role` 和 `content` |
| `command` | object | 否 | null | LangGraph Command（高级用途） |
| `metadata` | object | 否 | `{}` | 运行元数据 |
| `config` | object | 否 | null | RunnableConfig 覆盖 |
| `config.configurable` | object | 否 | — | 配置项，可传 `thread_id` |
| `context` | object | 否 | null | DeerFlow 上下文，见下方详细说明 |
| `context.model_name` | string | 否 | null | 指定模型，如 `"gpt-4o"` |
| `context.thinking_enabled` | boolean | 否 | false | 是否开启深度思考 |
| `webhook` | string | 否 | null | 完成后回调的 Webhook URL |
| `checkpoint_id` | string | 否 | null | 从指定检查点恢复 |
| `checkpoint` | object | 否 | null | 完整检查点对象 |
| `interrupt_before` | array \| `"*"` | 否 | null | 在哪些节点前中断 |
| `interrupt_after` | array \| `"*"` | 否 | null | 在哪些节点后中断 |
| `stream_mode` | array \| string | 否 | `["values"]` | 流模式，可选 `values` / `events` / `updates` |
| `stream_subgraphs` | boolean | 否 | false | 是否包含子图事件 |
| `stream_resumable` | boolean | 否 | null | SSE 可恢复模式 |
| `on_disconnect` | string | 否 | `"cancel"` | 断开时行为：`cancel` / `continue` |
| `on_completion` | string | 否 | `"keep"` | 完成后行为：`delete` / `keep` |
| `multitask_strategy` | string | 否 | `"reject"` | 并发策略：`reject` / `rollback` / `interrupt` / `enqueue` |
| `after_seconds` | float | 否 | null | 延迟执行秒数 |
| `if_not_exists` | string | 否 | `"create"` | 线程不存在时：`reject` / `create` |
| `feedback_keys` | array | 否 | null | LangSmith 反馈键列表 |

**请求示例**：
```json
{
  "input": {
    "messages": [
      { "role": "user", "content": "帮我分析一下最近的AI发展趋势" }
    ]
  },
  "context": {
    "model_name": "gpt-4o",
    "thinking_enabled": false
  },
  "stream_mode": ["values"],
  "multitask_strategy": "enqueue",
  "on_disconnect": "cancel"
}
```

**响应**：`text/event-stream`（SSE 流）

```
event: data
data: {"type": "message_chunk", "content": "AI发展趋势"}

event: data
data: {"type": "message_chunk", "content": "近年来..."}

event: end
data: {"type": "end"}
```

---

### 3.2 阻塞发送消息（等待完整结果）

```
POST /api/threads/{thread_id}/runs/wait
```

**Path 参数** 及 **Body 参数** 同 3.1。

**响应示例**（200）：
```json
{
  "messages": [
    { "role": "user", "content": "帮我分析..." },
    { "role": "assistant", "content": "AI发展趋势分析：..." }
  ],
  "title": "AI发展趋势分析"
}
```

---

### 3.3 后台创建运行

```
POST /api/threads/{thread_id}/runs
```

**Body 参数** 同 3.1。

**响应示例**（200）：
```json
{
  "run_id": "run_001",
  "thread_id": "550e8400-e29b-41d4-a716-446655440001",
  "assistant_id": null,
  "status": "pending",
  "metadata": {},
  "kwargs": {},
  "multitask_strategy": "reject",
  "created_at": "2026-04-09T10:00:00Z",
  "updated_at": "2026-04-09T10:00:00Z"
}
```

---

### 3.4 列出线程的所有运行

```
GET /api/threads/{thread_id}/runs
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**响应示例**（200）：返回 RunResponse 数组，结构同 3.3。

---

### 3.5 获取运行详情

```
GET /api/threads/{thread_id}/runs/{run_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |
| `run_id` | string | 是 | 运行 ID |

**响应示例**（200）：结构同 3.3，`status` 可能为 `pending` / `running` / `success` / `failed` / `interrupted` / `timeout`。

---

### 3.6 取消运行

```
POST /api/threads/{thread_id}/runs/{run_id}/cancel
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |
| `run_id` | string | 是 | 运行 ID |

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | string | 否 | `"interrupt"` | `interrupt`（中断）或 `rollback`（回滚） |
| `wait` | boolean | 否 | false | 是否等待取消完成 |

**响应**：202 Accepted 或 204 No Content

---

### 3.7 加入现有运行的 SSE 流

```
GET /api/threads/{thread_id}/runs/{run_id}/join
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |
| `run_id` | string | 是 | 运行 ID |

**响应**：`text/event-stream`（SSE 流，加入已有运行的输出）

---

### 3.8 无状态流式运行（自动创建临时线程）

```
POST /api/runs/stream
```

**Body 参数** 同 3.1，无需 `thread_id`。

**响应**：`text/event-stream`

---

### 3.9 无状态阻塞运行（自动创建临时线程）

```
POST /api/runs/wait
```

**Body 参数** 同 3.1，无需 `thread_id`。

**响应示例**（200）：最终通道值对象。

---

## 4. 记忆管理 Memory

**路由前缀**：`/api/memory`

> 记忆层级（layer）可选值：`agent_private` / `workspace_shared` / `tenant_shared` / `platform_shared`
> 记忆分类（category）可选值：`context` / `preference` / `knowledge` / `behavior` / `goal`

---

### MemoryResponse 数据结构说明

```json
{
  "version": "1.0",
  "lastUpdated": "2026-04-09T10:00:00Z",
  "user": {
    "workContext": {
      "summary": "用户主要从事 AI 开发工作",
      "updatedAt": "2026-04-09T10:00:00Z"
    },
    "personalContext": {
      "summary": "用户偏好简洁直接的回答风格",
      "updatedAt": "2026-04-09T10:00:00Z"
    },
    "topOfMind": {
      "summary": "用户最近在研究移动端 AI 应用开发",
      "updatedAt": "2026-04-09T10:00:00Z"
    }
  },
  "history": {
    "recentMonths": {
      "summary": "近期主要讨论了前端开发和 API 对接",
      "updatedAt": "2026-04-09T10:00:00Z"
    },
    "earlierContext": {
      "summary": "半年前曾讨论过数据库优化",
      "updatedAt": "2026-04-09T09:00:00Z"
    },
    "longTermBackground": {
      "summary": "用户是全栈工程师，熟悉 Python 和 TypeScript",
      "updatedAt": "2026-01-01T00:00:00Z"
    }
  },
  "facts": [
    {
      "id": "fact_abc123",
      "content": "用户偏好简洁的回答风格",
      "category": "preference",
      "confidence": 0.95,
      "createdAt": "2026-04-09T10:00:00Z",
      "source": "550e8400-e29b-41d4-a716-446655440001",
      "sourceError": null
    }
  ]
}
```

---

### 4.1 获取记忆数据（查）

```
GET /api/memory
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layer` | string | 否 | null | 指定记忆层：`agent_private` / `workspace_shared` / `tenant_shared` / `platform_shared` |
| `agent_name` | string | 否 | null | 指定 Agent 名称，获取对应 Agent 的记忆 |

**响应示例**（200）：返回 MemoryResponse，结构见上方说明。

---

### 4.2 获取分层记忆

```
GET /api/memory/layered
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `agent_name` | string | 否 | null | 指定 Agent 名称 |

**响应示例**（200）：
```json
{
  "scope": {
    "user_id": "user_123",
    "workspace_id": "ws_001",
    "tenant_id": "tenant_001"
  },
  "order": ["agent_private", "workspace_shared", "tenant_shared"],
  "layers": {
    "agent_private": { /* MemoryResponse */ },
    "workspace_shared": { /* MemoryResponse */ },
    "tenant_shared": { /* MemoryResponse */ }
  }
}
```

---

### 4.3 获取记忆状态（配置 + 数据）

```
GET /api/memory/status
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layer` | string | 否 | null | 指定记忆层 |
| `agent_name` | string | 否 | null | 指定 Agent 名称 |

**响应示例**（200）：
```json
{
  "config": {
    "enabled": true,
    "storage_path": ".deer-flow/memory.json",
    "debounce_seconds": 30,
    "max_facts": 100,
    "fact_confidence_threshold": 0.7,
    "injection_enabled": true,
    "max_injection_tokens": 2000,
    "backend": "file",
    "injection_strategy": "prompt_template",
    "layered_scopes": ["agent_private", "workspace_shared", "tenant_shared"]
  },
  "memory": { /* MemoryResponse */ }
}
```

---

### 4.4 获取记忆配置

```
GET /api/memory/config
```

**响应示例**（200）：
```json
{
  "enabled": true,
  "storage_path": ".deer-flow/memory.json",
  "debounce_seconds": 30,
  "max_facts": 100,
  "fact_confidence_threshold": 0.7,
  "injection_enabled": true,
  "max_injection_tokens": 2000,
  "backend": "file",
  "injection_strategy": "prompt_template",
  "layered_scopes": ["agent_private", "workspace_shared", "tenant_shared"]
}
```

---

### 4.5 新增记忆事实（增）

```
POST /api/memory/facts
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| `content` | string | **是** | — | 长度 ≥ 1 | 事实内容描述 |
| `category` | string | 否 | `"context"` | 见下方 | 分类：`context` / `preference` / `knowledge` / `behavior` / `goal` |
| `confidence` | float | 否 | 0.5 | 0.0 ~ 1.0 | 置信度，越高越重要 |

**请求示例**：
```json
{
  "content": "用户偏好使用 TypeScript 而非 JavaScript",
  "category": "preference",
  "confidence": 0.9
}
```

**响应示例**（200）：返回更新后的完整 MemoryResponse（包含新增的 fact）。

---

### 4.6 更新记忆事实（改）

```
PATCH /api/memory/facts/{fact_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `fact_id` | string | 是 | 事实 ID（如 `fact_abc123`） |

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layer` | string | 否 | null | 指定记忆层 |
| `agent_name` | string | 否 | null | 指定 Agent 名称 |

**Body 参数**（至少填写一项）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 否 | 更新的事实内容 |
| `category` | string | 否 | 更新的分类 |
| `confidence` | float | 否 | 更新的置信度（0.0 ~ 1.0） |

**请求示例**：
```json
{
  "content": "用户偏好使用 TypeScript，尤其是在大型项目中",
  "confidence": 0.95
}
```

**响应示例**（200）：返回更新后的完整 MemoryResponse。

---

### 4.7 删除记忆事实（删）

```
DELETE /api/memory/facts/{fact_id}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `fact_id` | string | 是 | 事实 ID |

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layer` | string | 否 | null | 指定记忆层 |
| `agent_name` | string | 否 | null | 指定 Agent 名称 |

**响应示例**（200）：返回删除后的完整 MemoryResponse（该 fact 已移除）。

---

### 4.8 清除全部记忆（危险操作）

```
DELETE /api/memory
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layer` | string | 否 | null | 指定只清除某层；不传则清除所有层 |
| `agent_name` | string | 否 | null | 指定 Agent 名称 |

**响应示例**（200）：返回清空后的空 MemoryResponse。

---

### 4.9 强制重新加载记忆

```
POST /api/memory/reload
```

**响应示例**（200）：返回重新加载后的 MemoryResponse。

---

### 4.10 获取每日短期记忆日志

```
GET /api/memory/daily-logs
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| `agent_name` | string | 否 | null | — | 指定 Agent 名称 |
| `limit` | integer | 否 | 100 | 1 ~ 500 | 返回数量上限 |

**响应示例**（200）：
```json
{
  "scope": { "user_id": "user_123", "workspace_id": "ws_001" },
  "count": 5,
  "logs": [
    {
      "date": "2026-04-09",
      "summary": "用户今天主要讨论了移动端 API 对接",
      "created_at": "2026-04-09T23:00:00Z"
    }
  ]
}
```

---

### 4.11 获取短期记忆事件

```
GET /api/memory/events
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| `agent_name` | string | 否 | null | — | 指定 Agent 名称 |
| `limit` | integer | 否 | 100 | 1 ~ 500 | 返回数量上限 |

**响应示例**（200）：
```json
{
  "scope": { "user_id": "user_123" },
  "count": 10,
  "events": [
    {
      "event_id": "evt_001",
      "type": "fact_created",
      "content": "新增记忆：用户偏好 TypeScript",
      "created_at": "2026-04-09T10:00:00Z"
    }
  ]
}
```

---

### 4.12 导出记忆

```
GET /api/memory/export
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `layer` | string | 否 | null | 指定记忆层 |
| `agent_name` | string | 否 | null | 指定 Agent 名称 |

**响应示例**（200）：返回完整 MemoryResponse JSON，可直接用于导入。

---

### 4.13 导入记忆

```
POST /api/memory/import
```

**Body 参数**：完整的 MemoryResponse 对象（结构见 4 节开头说明）。

**响应示例**（200）：返回导入后的 MemoryResponse。

---

## 5. 管理员记忆 Admin Memory

**路由前缀**：`/api/admin/memory`
**认证**：需要管理员角色

---

### 5.1 获取分层记忆（带范围筛选）

```
GET /api/admin/memory/layered
```

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tenant_id` | string | 否 | 指定租户 |
| `workspace_id` | string | 否 | 指定工作区 |
| `user_id` | string | 否 | 指定用户 |
| `session_id` | string | 否 | 指定会话 |
| `agent_name` | string | 否 | 指定 Agent |
| `layers` | array | 否 | 指定层列表（可多选） |

**响应示例**（200）：
```json
{
  "scope": { "tenant_id": "tenant_001", "user_id": "user_123" },
  "layers": ["agent_private", "workspace_shared"],
  "memory": {
    "agent_private": { /* MemoryResponse */ },
    "workspace_shared": { /* MemoryResponse */ }
  }
}
```

---

### 5.2 获取记忆索引

```
GET /api/admin/memory/index
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `tenant_id` | string | 否 | null | 租户筛选 |
| `workspace_id` | string | 否 | null | 工作区筛选 |
| `user_id` | string | 否 | null | 用户筛选 |
| `agent_name` | string | 否 | null | Agent 筛选 |
| `limit` | integer | 否 | 200 | 返回数量上限 |

**响应示例**（200）：
```json
{
  "scope": { "user_id": "user_123" },
  "count": 15,
  "index": [
    {
      "fact_id": "fact_abc123",
      "content": "用户偏好 TypeScript",
      "category": "preference",
      "layer": "agent_private"
    }
  ]
}
```

---

### 5.3 获取记忆主题

```
GET /api/admin/memory/topics
```

**Query 参数** 同 5.2。

**响应示例**（200）：
```json
{
  "scope": { "user_id": "user_123" },
  "count": 3,
  "topics": [
    {
      "topic_id": "topic_001",
      "title": "编程偏好",
      "content": "用户偏好 TypeScript 和简洁代码风格",
      "tags": ["programming", "preference"],
      "source": "dreaming",
      "created_at": "2026-04-09T10:00:00Z"
    }
  ]
}
```

---

### 5.4 创建或更新记忆主题

```
POST /api/admin/memory/topics
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `topic_id` | string | 否 | 自动生成 | 主题 ID（用于更新） |
| `tenant_id` | string | 否 | null | 租户 ID |
| `workspace_id` | string | 否 | null | 工作区 ID |
| `user_id` | string | 否 | null | 用户 ID |
| `agent_name` | string | 否 | null | Agent 名称 |
| `scope` | string | 否 | `"workspace_shared"` | 范围：`workspace_shared` / `agent_private` |
| `title` | string | **是** | — | 主题标题 |
| `content` | string | **是** | — | 主题内容 |
| `tags` | array | 否 | `[]` | 标签列表 |
| `source` | string | 否 | `"manual"` | 来源：`manual` / `dreaming` |
| `metadata` | object | 否 | `{}` | 扩展元数据 |

---

### 5.5 搜索记忆

```
POST /api/admin/memory/search
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | **是** | — | 搜索关键词或语义查询 |
| `limit` | integer | 否 | 20 | 返回结果数量上限 |
| `tenant_id` | string | 否 | null | 租户筛选 |
| `workspace_id` | string | 否 | null | 工作区筛选 |
| `user_id` | string | 否 | null | 用户筛选 |
| `session_id` | string | 否 | null | 会话筛选 |
| `agent_name` | string | 否 | null | Agent 筛选 |
| `layers` | array | 否 | null | 指定搜索的层列表 |

**请求示例**：
```json
{
  "query": "用户的编程语言偏好",
  "limit": 10,
  "user_id": "user_123",
  "layers": ["agent_private", "workspace_shared"]
}
```

**响应示例**（200）：
```json
{
  "query": "用户的编程语言偏好",
  "scope": { "user_id": "user_123" },
  "layers": ["agent_private", "workspace_shared"],
  "count": 2,
  "hits": [
    {
      "fact_id": "fact_abc123",
      "content": "用户偏好 TypeScript",
      "category": "preference",
      "confidence": 0.95,
      "layer": "agent_private",
      "score": 0.92
    }
  ]
}
```

---

### 5.6 获取用户记忆

```
GET /api/admin/memory/user-memory
```

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tenant_id` | string | 否 | 租户 ID |
| `workspace_id` | string | 否 | 工作区 ID |
| `user_id` | string | 否 | 用户 ID |
| `layer` | string | 否 | 指定记忆层 |
| `agent_name` | string | 否 | Agent 名称 |

---

### 5.7 获取平台记忆

```
GET /api/admin/memory/platform
```

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `limit` | integer | 否 | 200 | 返回数量上限 |

---

### 5.8 创建或更新平台记忆

```
POST /api/admin/memory/platform
```

**Body 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | **是** | 唯一键（用于幂等更新） |
| `title` | string | **是** | 平台记忆标题 |
| `content` | string | **是** | 平台记忆内容 |
| `tags` | array | 否 | 标签列表 |
| `metadata` | object | 否 | 扩展元数据 |

---

### 5.9 重建记忆索引

```
POST /api/admin/memory/rebuild-index
```

**Body 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tenant_id` | string | 否 | 租户筛选 |
| `workspace_id` | string | 否 | 工作区筛选 |
| `user_id` | string | 否 | 用户筛选 |
| `agent_name` | string | 否 | Agent 筛选 |

---

### 5.10 生成记忆梦想总结（AI 整合）

```
POST /api/admin/memory/dream
```

**Body 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tenant_id` | string | 否 | 租户筛选 |
| `workspace_id` | string | 否 | 工作区筛选 |
| `user_id` | string | 否 | 用户筛选 |
| `agent_name` | string | 否 | Agent 名称 |
| `model_name` | string | 否 | 指定整合使用的模型 |

**响应示例**（200）：
```json
{
  "created": true,
  "topic": {
    "topic_id": "topic_002",
    "title": "AI 整合生成的综合记忆",
    "content": "..."
  },
  "index_count": 12
}
```

---

## 6. 文件上传 Uploads

**路由前缀**：`/api/threads/{thread_id}/uploads`

---

### 6.1 上传文件

```
POST /api/threads/{thread_id}/uploads
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**Body 参数**（`multipart/form-data`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `files` | file[] | **是** | 上传的文件（支持多文件） |

**响应示例**（200）：
```json
{
  "success": true,
  "files": [
    {
      "filename": "document.pdf",
      "size": "12345",
      "path": "/local/path/document.pdf",
      "virtual_path": "/mnt/user-data/uploads/document.pdf",
      "artifact_url": "/api/threads/xxx/artifacts/.../document.pdf",
      "markdown_file": "document.md",
      "markdown_path": "/local/path/document.md",
      "markdown_virtual_path": "/mnt/user-data/uploads/document.md",
      "markdown_artifact_url": "/api/threads/xxx/artifacts/.../document.md"
    }
  ],
  "message": "Successfully uploaded 1 file(s)"
}
```

---

### 6.2 列出已上传文件

```
GET /api/threads/{thread_id}/uploads/list
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**响应示例**（200）：
```json
{
  "files": [
    {
      "filename": "document.pdf",
      "size": 12345,
      "artifact_url": "/api/threads/xxx/artifacts/.../document.pdf"
    }
  ],
  "count": 1
}
```

---

### 6.3 删除已上传文件

```
DELETE /api/threads/{thread_id}/uploads/{filename}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |
| `filename` | string | 是 | 文件名 |

**响应示例**（200）：
```json
{
  "success": true,
  "message": "Deleted document.pdf"
}
```

---

## 7. 制品获取 Artifacts

**路由前缀**：`/api/threads/{thread_id}/artifacts`

---

### 7.1 获取制品文件

```
GET /api/threads/{thread_id}/artifacts/{path}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |
| `path` | string | 是 | 虚拟制品路径（支持子路径，如 `reports/output.pdf`） |

**Query 参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `download` | boolean | 否 | false | `true` 时强制下载，`false` 时内联预览 |

**响应**：文件内容流（Content-Type 根据文件类型自动判断）

---

## 8. 后续建议 Suggestions

**路由前缀**：`/api/threads/{thread_id}/suggestions`

---

### 8.1 生成后续问题建议

```
POST /api/threads/{thread_id}/suggestions
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thread_id` | string | 是 | 线程 ID |

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 范围 | 说明 |
|------|------|------|--------|------|------|
| `messages` | array | **是** | — | — | 对话消息列表，每项含 `role` 和 `content` |
| `messages[].role` | string | **是** | — | `user` / `assistant` | 消息角色 |
| `messages[].content` | string | **是** | — | — | 消息文本内容 |
| `n` | integer | 否 | 3 | 1 ~ 5 | 建议数量 |
| `model_name` | string | 否 | null | — | 覆盖模型名称 |

**请求示例**：
```json
{
  "messages": [
    { "role": "user", "content": "帮我分析 AI 发展趋势" },
    { "role": "assistant", "content": "AI 近年来在以下几个方面发展迅速..." }
  ],
  "n": 3
}
```

**响应示例**（200）：
```json
{
  "suggestions": [
    "AI 在医疗领域有哪些具体应用？",
    "大模型的训练成本趋势如何？",
    "开源 AI 模型与商业模型相比有什么优势？"
  ]
}
```

---

## 9. 模型列表 Models

**路由前缀**：`/api/models`

---

### 9.1 列出所有可用模型

```
GET /api/models
```

**响应示例**（200）：
```json
{
  "models": [
    {
      "name": "gpt-4o",
      "model": "gpt-4o",
      "display_name": "GPT-4O",
      "description": "OpenAI 最新旗舰模型",
      "supports_thinking": false,
      "supports_reasoning_effort": false
    },
    {
      "name": "claude-sonnet-4-6",
      "model": "claude-sonnet-4-6",
      "display_name": "Claude Sonnet 4.6",
      "description": "Anthropic Claude 最新模型",
      "supports_thinking": true,
      "supports_reasoning_effort": false
    }
  ]
}
```

---

### 9.2 获取特定模型详情

```
GET /api/models/{model_name}
```

**Path 参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model_name` | string | 是 | 模型名称，如 `gpt-4o` |

**响应示例**（200）：返回单个模型对象，结构同 9.1 中的数组元素。

---

## 10. 认证接口 Auth

**路由前缀**：`/api/auth`

---

### 10.1 用户登录

```
POST /api/auth/user-login
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `username` | string | **是** | — | 用户名 |
| `password` | string | **是** | — | 密码 |
| `tenant_id` | string | 否 | null | 租户 ID |
| `workspace_id` | string | 否 | null | 工作区 ID |

**请求示例**：
```json
{
  "username": "demo",
  "password": "Demo@123456"
}
```

**响应示例**（200）：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "user_123",
  "username": "demo",
  "display_name": "Demo User",
  "tenant_id": "tenant_001",
  "workspace_id": "ws_001",
  "roles": ["user"]
}
```

---

### 10.2 管理员登录

```
POST /api/auth/admin-login
```

**Body 参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | **是** | 管理员用户名 |
| `password` | string | **是** | 管理员密码 |

---

### 10.3 用户注册

```
POST /api/auth/register
```

**Body 参数**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `username` | string | **是** | — | 用户名（唯一） |
| `password` | string | **是** | — | 密码 |
| `display_name` | string | 否 | null | 显示名称 |
| `tenant_id` | string | 否 | null | 租户 ID |
| `workspace_id` | string | 否 | null | 工作区 ID |
| `metadata` | object | 否 | `{}` | 扩展元数据 |

---

### 10.4 登出

```
POST /api/auth/logout
```

**响应示例**（200）：
```json
{ "message": "Logged out successfully" }
```

---

### 10.5 获取当前用户信息

```
GET /api/auth/me
```

**响应示例**（200）：
```json
{
  "user_id": "user_123",
  "username": "demo",
  "display_name": "Demo User",
  "tenant_id": "tenant_001",
  "workspace_id": "ws_001",
  "roles": ["user"],
  "metadata": {}
}
```

---

### 10.6 获取当前会话信息

```
GET /api/auth/session
```

**响应示例**（200）：返回当前会话对象。

---

## 统一错误码

### 错误响应格式

```json
{
  "detail": "具体的错误描述信息"
}
```

### HTTP 状态码说明

| 状态码 | 含义 | 常见原因 |
|--------|------|---------|
| 200 | 成功 | 请求处理完成 |
| 201 | 创建成功 | 资源创建完成 |
| 202 | 已接受 | 异步操作已接受（如取消运行） |
| 204 | 无内容 | 操作成功但无返回内容（如删除） |
| 400 | 请求错误 | 参数格式错误或逻辑错误 |
| 401 | 未认证 | 未提供有效 Token |
| 403 | 无权限 | Token 有效但权限不足 |
| 404 | 不存在 | 请求的资源未找到 |
| 409 | 冲突 | 资源已存在（如用户名重复） |
| 422 | 验证失败 | 请求体字段类型或值不合法 |
| 500 | 服务器错误 | 服务内部异常 |
| 503 | 服务不可用 | 存储/检查点器不可用 |

---

## 移动端对接快速参考

详细的完整调用流程请参阅文档顶部的 **[核心流程](#核心流程)** 章节，以下为接口速查索引：

```
【私人模式聊天】
① POST /api/auth/user-login          → 登录，获取 token
② POST /api/threads                  → 新建线程（新对话）
③ POST /api/threads/{id}/uploads     → 上传附件（可选）
④ POST /api/threads/{id}/runs/stream → ⭐ 发送消息（SSE 流式）
⑤ POST /api/sessions                 → 注册会话绑定（后台）
⑥ POST /api/threads/{id}/state       → 持久化标题（检测到 title 后）
⑦ POST /api/threads/{id}/suggestions → 获取后续建议（可选）
⑧ POST /api/threads/search           → 加载历史对话列表
⑨ GET  /api/threads/{id}/state       → 加载历史消息
⑩ DELETE /api/threads/{id}           → 删除对话

【决策模式聊天】
① POST /api/auth/user-login           → 登录
② POST /api/threads                   → 为每个 Coach 懒创建线程
③ POST /api/threads/{id}/runs/wait    → ⭐ 并发阻塞发送（所有 Coach 并行）
④ GET  /api/threads/{id}/state        → 读取各 Coach 最终回复
⑤ DELETE /api/threads/{id}            → 删除 Coach 线程

【记忆面板】
① GET    /api/memory                  → ⭐ 加载全量记忆
② POST   /api/memory/facts            → 新增事实
③ PATCH  /api/memory/facts/{id}       → 编辑事实
④ DELETE /api/memory/facts/{id}       → 删除单条事实
⑤ DELETE /api/memory                  → ⚠️ 清空全部记忆
```
