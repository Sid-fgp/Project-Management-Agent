# 工作事务进度追踪台账（多人共享版）

一个支持**多人注册 + 创始账号审核**的个人工作事务进度追踪应用。

## 功能

- 📋 事务管理：增删改、归类，含标题/描述/优先级/截止日期/状态
- 🕒 进度追踪：状态变更自动写入时间轴日志，支持多维筛选与排序
- 🔔 提醒机制：临近截止高亮、逾期红色标记
- 💾 数据持久化：本地存储 + JSON 导出/导入
- 👥 多账号 + 数据隔离：每个账号只能看到自己的事项
- 🛡 创始账号审核：新注册需创始账号 `sidfeng@summit-pines.com` 审核通过才能使用
- 🔐 密码规则：6 位及以上纯数字

## 技术栈

- 后端：Node.js 内置模块（**零第三方依赖**），共享 JSON 数据库 `data/db.json`
- 前端：单文件 `index.html`（原生 HTML/CSS/JS，无构建步骤）
- 部署：支持 Render / Railway / 本机 `node server.js`
- 持久化：设 `DATABASE_URL`（Postgres 连接串）即用外部数据库，**重部署数据不丢**；不设则本地 `data/db.json`（重部署清空）

## 本地运行

```bash
node server.js
# 打开 http://localhost:3000
```

创始账号：`sidfeng@summit-pines.com`　密码：`123456`

## 持久化（重要）

默认用本地文件 `data/db.json`，**重部署会清空**。要永久保存，设置环境变量 `DATABASE_URL` 为任意 Postgres 连接串（如 Neon / Supabase 免费库），重启即自动建表、数据存于外部库，重部署不丢。

## 部署

详见 **RENDER部署教程.md**（含 Render 一键部署 + 数据持久化说明）。
