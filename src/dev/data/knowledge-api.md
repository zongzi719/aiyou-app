# 知识库 API 接口文档

> 适用场景：移动端对接知识库模块（文件夹管理 + 文件管理 + 内容预览）

---

## 基础信息

| 项目 | 说明 |
|------|------|
| **Base URL** | `https://your-domain.com`（通过 Nginx 统一代理） |
| **接口前缀** | `/api/knowledge` |
| **数据格式** | `application/json`（文件上传除外） |
| **认证方式** | 请求头携带用户身份（见下方认证说明） |

---

## 认证请求头

**所有接口** 均需携带以下请求头，服务端以 `x-user-id` 做用户数据隔离：

```
Authorization:  Bearer {token}
x-auth-token:   {token}
x-user-id:      {userId}
x-tenant-id:    {tenantId}
x-workspace-id: {workspaceId}
```

> 缺少 `x-user-id` 且服务端未配置默认用户时，返回 `401 Unauthorized`。

---

## 错误响应格式

```json
{
  "detail": "错误描述信息"
}
```

| 状态码 | 含义 |
|--------|------|
| `400` | 请求参数错误 |
| `401` | 未携带认证信息 |
| `404` | 资源不存在或不属于当前用户 |
| `503` | 知识库数据库不可用 |

---

## 一、文件夹管理

### 1.1 获取文件夹列表

```
GET /api/knowledge/folders
```

**请求参数：** 无

**响应示例：**

```json
{
  "folders": [
    {
      "id": "abc123",
      "name": "技术文档",
      "count": 12
    },
    {
      "id": "def456",
      "name": "合同资料",
      "count": 3
    }
  ]
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 文件夹唯一 ID |
| `name` | string | 文件夹名称 |
| `count` | int | 文件夹内文件数量 |

> 按创建时间升序排列，仅返回当前用户的文件夹。

---

### 1.2 创建文件夹

```
POST /api/knowledge/folders
Content-Type: application/json
```

**请求体：**

```json
{
  "name": "技术文档"
}
```

**字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 文件夹名称，不能为空字符串 |

**响应示例：**

```json
{
  "id": "abc123def456",
  "name": "技术文档"
}
```

---

### 1.3 重命名文件夹

```
PATCH /api/knowledge/folders/{folder_id}
Content-Type: application/json
```

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `folder_id` | string | 文件夹 ID |

**请求体：**

```json
{
  "name": "新名称"
}
```

**响应示例：**

```json
{
  "updated": true
}
```

**错误：**

| 状态码 | 说明 |
|--------|------|
| `400` | 名称为空 |
| `404` | 文件夹不存在或不属于当前用户 |

---

### 1.4 删除文件夹

```
DELETE /api/knowledge/folders/{folder_id}
```

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `folder_id` | string | 文件夹 ID |

**响应示例：**

```json
{
  "deleted": true
}
```

> ⚠️ 删除文件夹后，原属于该文件夹的文件**不会被删除**，其 `folder_id` 自动置为 `null`（归入"全部文件"）。

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 文件夹不存在或不属于当前用户 |

---

## 二、文件管理

### 2.1 获取文件列表（支持按文件夹切换）

```
GET /api/knowledge/files
```

**说明：** 前端点击不同文件夹时，传入对应 `folder_id` 即可筛选该文件夹下的文件；不传或传 `all` 表示查看全部文件。

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `folder_id` | string | 否 | 按文件夹过滤；传 `all` 或不传表示全部；传 `none` 表示仅显示未归入任何文件夹的文件 |
| `status` | string | 否 | 按处理状态过滤（见状态枚举） |
| `q` | string | 否 | 按文件名模糊搜索 |
| `page` | int | 否 | 页码，默认 `1` |
| `page_size` | int | 否 | 每页数量，默认 `50`，最大 `200` |

**请求示例（点击某文件夹）：**

```
GET /api/knowledge/files?folder_id=abc123&page=1&page_size=20
```

**请求示例（查看全部）：**

```
GET /api/knowledge/files?folder_id=all&page=1&page_size=20
```

**响应示例：**

```json
{
  "files": [
    {
      "id": "file_abc123",
      "filename": "产品手册.pdf",
      "mime_type": "application/pdf",
      "file_size": 204800,
      "folder_id": "abc123",
      "status": "done",
      "chunk_count": 42,
      "created_at": "2026-04-13T08:30:00+00:00",
      "progress": 1.0
    }
  ],
  "total": 58
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 文件唯一 ID |
| `filename` | string | 文件名 |
| `mime_type` | string | 文件 MIME 类型 |
| `file_size` | int | 文件大小（字节） |
| `folder_id` | string\|null | 所属文件夹 ID，无文件夹时为 `null` |
| `status` | string | 处理状态（见状态枚举） |
| `chunk_count` | int | 拆分的知识块数量，处理完成后有值 |
| `created_at` | string | 创建时间（ISO 8601） |
| `progress` | float\|null | 处理进度 `0.0 ~ 1.0` |
| `total` | int | 符合条件的文件总数（用于分页） |

---

### 2.2 上传文件（新增文档到知识库）

```
POST /api/knowledge/upload
Content-Type: multipart/form-data
```

**说明：** 将本地文件上传至知识库，上传后自动进入后台解析和向量化队列；可指定归入的文件夹。

**Form 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 要上传的文件 |
| `folder_id` | string | 否 | 目标文件夹 ID；传 `all` / `recent` / 不传视为不归入任何文件夹 |
| `chunk_separator` | string | 否 | 分块分隔符（与 Web 一致；默认 `\n\n`） |
| `chunk_size` | int | 否 | 分块大小（默认 `512`） |
| `chunk_overlap` | int | 否 | 分块重叠（默认 `50`） |

**响应示例：**

```json
{
  "file_id": "abc123def456",
  "filename": "产品手册.pdf",
  "status": "queued",
  "folder_id": "abc123"
}
```

**上传后推荐流程：**

```
POST /upload（获得 file_id）
   ↓
每隔 2s 轮询 GET /status/{file_id}
   ↓
status == "done" → 刷新文件列表
status == "error" → 提示用户，提供"重新处理"按钮
```

**支持的文件类型：**

| 类型 | 扩展名 |
|------|--------|
| 文档 | `.pdf` `.doc` `.docx` `.ppt` `.pptx` `.xlsx` `.xls` |
| 文本 | `.txt` `.md` |
| 图片 | `.jpg` `.png` `.gif` 等 |
| 音视频 | `.mp3` `.mp4` 等 |

**错误：**

| 状态码 | 说明 |
|--------|------|
| `400` | 未提供文件或文件名为空 |
| `400` | 不支持的文件类型 |

---

### 2.3 移动文件到指定文件夹

```
PATCH /api/knowledge/files/{file_id}
Content-Type: application/json
```

**说明：** 将文件移动到其他文件夹，或从文件夹中移出（置为"未分类"）。

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | string | 文件 ID |

**请求体：**

```json
{
  "folder_id": "def456"
}
```

> 传 `null` 表示将文件移出文件夹，归入"全部文件"。

**响应示例：**

```json
{
  "updated": true
}
```

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 文件或目标文件夹不存在或不属于当前用户 |

---

### 2.4 删除文件

```
DELETE /api/knowledge/files/{file_id}
```

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | string | 文件 ID |

**响应示例：**

```json
{
  "deleted": true
}
```

> 同时删除磁盘上的文件及数据库中的文件记录与所有知识块（chunk）。

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 文件不存在或不属于当前用户 |

---

### 2.5 查询文件处理状态

```
GET /api/knowledge/status/{file_id}
```

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | string | 文件 ID |

**响应示例（处理中）：**

```json
{
  "status": "processing",
  "progress": 0.65,
  "error_message": null
}
```

**响应示例（完成）：**

```json
{
  "status": "done",
  "progress": 1.0,
  "error_message": null
}
```

**响应示例（失败）：**

```json
{
  "status": "error",
  "progress": null,
  "error_message": "Failed to parse document"
}
```

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 文件不存在或不属于当前用户 |

---

### 2.6 重新索引文件

```
POST /api/knowledge/reindex/{file_id}
```

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | string | 文件 ID |

**请求体（与 Web 管理端一致，可选但建议携带）：**

```json
{
  "separator": "\n\n",
  "chunk_size": 512,
  "chunk_overlap": 50
}
```

**响应示例：**

```json
{
  "queued": true
}
```

> 将失败的文件重置为 `queued` 状态并重新触发后台解析，用于修复处理失败的文件。

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 文件不存在或不属于当前用户 |

---

## 三、内容分块预览

### 3.1 列出分块（POST · 与 Web 管理端一致，**移动端优先**）

```
POST /api/knowledge/preview-chunks/{file_id}
Content-Type: application/json
```

**说明：** Web 管理端详情里展示的分块来自本接口。路径中的 `file_id` 建议 `encodeURIComponent`。支持 Query：`page`、`page_size`（与下方 GET 备选相同）。

**请求体（与 Web `reindex` 所用分块参数一致）：**

```json
{
  "separator": "\n\n",
  "chunk_size": 512,
  "chunk_overlap": 50
}
```

**响应示例（实际可能无 `chunks[].id`，可有 `char_count`、`section_title`）：**

```json
{
  "chunks": [
    {
      "index": 0,
      "content": "...",
      "token_count": 39,
      "char_count": 157,
      "section_title": null
    }
  ],
  "total": 1
}
```

---

### 3.2 列出分块（GET · 文档备选）

```
GET /api/knowledge/files/{file_id}/chunks
```

**说明：** 部分部署若实现本路径，移动端可在 `POST preview-chunks` 返回 404 时回退使用。仅 `status == "done"`（或网关的 `ready` 等已映射为完成态）的文件可获取分块。

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | string | 文件 ID |

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | int | 否 | 页码，默认 `1` |
| `page_size` | int | 否 | 每页分块数，默认 `20`，最大 `100` |

**请求示例：**

```
GET /api/knowledge/files/file_abc123/chunks?page=1&page_size=20
```

**响应示例：**

```json
{
  "file_id": "file_abc123",
  "filename": "产品手册.pdf",
  "chunks": [
    {
      "id": "chunk_001",
      "index": 0,
      "content": "本手册介绍了产品的核心功能与使用说明，适用于所有用户...",
      "token_count": 128,
      "metadata": {
        "page": 1,
        "section": "前言"
      }
    },
    {
      "id": "chunk_002",
      "index": 1,
      "content": "第一章：快速上手。安装步骤如下：1. 下载安装包...",
      "token_count": 256,
      "metadata": {
        "page": 3,
        "section": "第一章"
      }
    }
  ],
  "total": 42
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `file_id` | string | 所属文件 ID |
| `filename` | string | 文件名 |
| `chunks` | array | 分块列表 |
| `chunks[].id` | string | 分块唯一 ID |
| `chunks[].index` | int | 分块序号（从 0 开始） |
| `chunks[].content` | string | 分块文本内容 |
| `chunks[].token_count` | int | 该分块的 token 数 |
| `chunks[].metadata` | object | 分块附加信息（如原始页码、章节名等，字段因文件类型而异） |
| `total` | int | 总分块数 |

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 文件不存在或不属于当前用户 |
| `400` | 文件尚未处理完成（status 不为 done） |

---

### 3.3 获取单个分块详情

```
GET /api/knowledge/chunks/{chunk_id}
```

**说明：** 获取某一分块的完整内容（用于分块内容超长时的详情展开）。

**Path 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `chunk_id` | string | 分块 ID |

**响应示例：**

```json
{
  "id": "chunk_001",
  "file_id": "file_abc123",
  "filename": "产品手册.pdf",
  "index": 0,
  "content": "本手册介绍了产品的核心功能与使用说明，适用于所有用户...",
  "token_count": 128,
  "metadata": {
    "page": 1,
    "section": "前言"
  }
}
```

**错误：**

| 状态码 | 说明 |
|--------|------|
| `404` | 分块不存在或不属于当前用户 |

---

## 四、状态枚举

### 文件处理状态（status）

| 值 | 含义 | 终态 |
|----|------|------|
| `queued` | 等待处理 | 否 |
| `processing` | 后台解析/向量化中 | 否 |
| `done` | 处理完成，可被搜索 | ✅ |
| `ready` | 与 `done` 同义（部分网关/历史实现返回此值；移动端应视为可拉取分块） | ✅ |
| `error` | 处理失败 | ✅（可 reindex） |

**状态流转：**

```
上传成功
   ↓
queued → processing → done（或 ready）
                    ↘ error → (调用 reindex) → queued
```

---

## 五、接口速查表

| 功能 | 方法 | 路径 |
|------|------|------|
| 获取文件夹列表 | `GET` | `/api/knowledge/folders` |
| 新建文件夹 | `POST` | `/api/knowledge/folders` |
| 重命名文件夹 | `PATCH` | `/api/knowledge/folders/{folder_id}` |
| 删除文件夹 | `DELETE` | `/api/knowledge/folders/{folder_id}` |
| 按文件夹获取文件列表 | `GET` | `/api/knowledge/files?folder_id={folder_id}` |
| 上传文件（新增文档） | `POST` | `/api/knowledge/upload` |
| 移动文件到文件夹 | `PATCH` | `/api/knowledge/files/{file_id}` |
| 删除文件 | `DELETE` | `/api/knowledge/files/{file_id}` |
| 查询文件处理状态 | `GET` | `/api/knowledge/status/{file_id}` |
| 重新索引文件 | `POST` | `/api/knowledge/reindex/{file_id}`（Body：`separator` / `chunk_size` / `chunk_overlap`） |
| 列出文件分块（Web 同款） | `POST` | `/api/knowledge/preview-chunks/{file_id}` |
| 列出文件分块（备选） | `GET` | `/api/knowledge/files/{file_id}/chunks` |
| 获取单个分块详情 | `GET` | `/api/knowledge/chunks/{chunk_id}` |

---

## 六、移动端对接建议

1. **文件夹切换**：维护本地选中 `folder_id` 状态，切换文件夹时重置页码为 `1` 并重新请求 `GET /files?folder_id=xxx`；内置虚拟分组"全部"（`folder_id=all`）置于列表顶部
2. **新增文档**：`POST /upload`（Form 需带 `chunk_separator` / `chunk_size` / `chunk_overlap`，与 Web 一致）→ 获得 `file_id` → 每隔 2s 轮询 `GET /status/{file_id}` → 处理完成时刷新当前文件夹列表
3. **文件内容预览**：点击文件时先判断处理已完成（`done` / `ready` 等），再调用 **`POST /preview-chunks/{file_id}`**（与 Web 一致）；若 404 可回退 `GET /files/{file_id}/chunks`；未完成时展示进度或 loading
4. **分块预览展示**：列表页每块截取前 100 字符展示，点击"展开"调用 `GET /chunks/{chunk_id}` 获取完整内容
5. **分页加载**：文件列表和分块列表均支持 `page` + `page_size`，推荐移动端每页 `20` 条，上拉加载更多
6. **进度展示**：`progress` 字段值为 `0.0 ~ 1.0`，换算为百分比后展示进度条
7. **错误重试**：`status == "error"` 时给用户提供"重新处理"按钮，调用 `POST /reindex/{file_id}`（建议 Body 与 Web 一致传入分块参数）
