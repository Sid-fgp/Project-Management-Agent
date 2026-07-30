# 工作事务台账 · 部署到 Render（多人共享 + 创始账号审核）

本教程帮你把后端跑在 Render 上，获得一个**公网可访问的链接**。别人打开链接注册账号，会进入「待审核」状态，由你（创始账号 `sidfeng@summit-pines.com`）登录后审核通过才能使用。

---

## ⚠️ 重要前提：先把代码传到 GitHub

Render 是从 **Git 仓库** 拉代码部署的，所以需要你有一个 GitHub 账号，并把 `ledger-server` 这个文件夹的内容推上去。下面二选一。

### 方式 A：用 Git 命令行（推荐，最快）

1. 注册/登录 GitHub → 新建一个仓库（名字随便，如 `work-ledger`，**公开/私有均可**，建议私有）。
2. 在 GitHub 账号 **Settings → Developer settings → Personal access tokens → Tokens (classic)** 生成一个 token，勾选 `repo` 权限，复制下来（只显示一次）。
3. 在本机打开终端，进入 `ledger-server` 目录，执行：

```bash
# 把下面两行换成你自己的信息
GIT_TOKEN=你的token
REPO=你的用户名/work-ledger

git init
git add .
git commit -m "init work ledger"
git branch -M main
git remote add origin https://$GIT_TOKEN@github.com/$REPO.git
git push -u origin main
```

4. 刷新 GitHub 页面，确认 `server.js`、`index.html`、`seed_tasks.json`、`package.json`、`render.yaml` 等都在仓库里。

### 方式 B：用 GitHub Desktop（不想敲命令）

1. 下载安装 GitHub Desktop，登录账号，新建仓库（Local Path 选 `ledger-server` 文件夹）。
2. 左上角「Commit」→ 填写说明 →「Push origin」推送到 GitHub。
3. 在 GitHub 网页确认文件已上传。

---

## 🚀 在 Render 上部署（约 2 分钟）

1. 打开 https://render.com ，用 GitHub 账号登录（**Authorize Render** 授权）。
2. 点 **New → Web Service** → 选择你刚创建的仓库 `work-ledger` → **Connect**。
3. 配置项（大部分已自动识别，照着核对）：
   - **Name**：work-ledger（随意）
   - **Environment**：Node
   - **Build Command**：`true`（项目零依赖，无需安装）
   - **Start Command**：`node server.js`
   - **Plan**：Free（免费）
   - **Instance Region**：选离你近的，如 Singapore
4. 展开 **Advanced → Add Environment Variable**，确认/添加：
   - `PORT` = `3000`
   - `NODE_VERSION` = `20`
5. 点 **Create Web Service**。
6. 等待约 1 分钟，状态变绿 **Live** 后，点顶部的蓝色链接（形如 `https://work-ledger-xxxx.onrender.com`）——这就是你的**分享链接**！

> 提示：项目根目录的 `render.yaml` 已经把这些配置写好，Render 读取后会自动套用，正常情况下你只需点几下确认即可。

---

## 🔑 怎么用（分享给别人 + 创始审核）

1. 把上面的链接发给同事。
2. 同事打开 → 点「注册新账号」→ 填邮箱 + **6 位以上纯数字**密码 → 提交后显示「已提交，等待创始账号审核」。
3. **你**用 `sidfeng@summit-pines.com` / `123456` 登录 → 顶部出现「🛡 审核注册」按钮（带待审人数角标）→ 点开逐个「通过 / 拒绝」。
4. 审核通过后，该同事即可用自己的账号登录，看到**仅属于自己的**事项；你的 49 条事项始终只在你账号下。

---

## 💾 关于数据持久化（已支持 Postgres，推荐接入）

本应用存储层支持两种模式，**由环境变量 `DATABASE_URL` 决定**：

- **未设置 `DATABASE_URL`** → 用服务器本地文件 `data/db.json`。⚠️ Render 免费版文件系统是临时的，**重新部署 / 改代码后 redeploy 会清空**，数据回到初始（仅创始账号 + 49 条种子事项）。
- **设置了 `DATABASE_URL`（Postgres 连接串）** → 数据写入**外部独立数据库**，与 Render 实例解耦。**重部署、重启、休眠唤醒都不会丢数据**，多人注册与审核记录永久保存。✅

### ✅ 推荐：接入免费 Postgres（Neon，3 分钟，零信用卡）

1. 打开 https://neon.tech ，用 GitHub 登录，新建一个 Project（区域选离你近的，如 AWS Singapore）。
2. 创建后进入 **Dashboard → Connection Details**，把 **「Connection string」（Pooling 或 Direct 均可）** 复制下来，形如：
   ```
   postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
3. 回到 Render 的 **work-ledger 服务 → Environment → Add Environment Variable**：
   - Key：`DATABASE_URL`
   - Value：粘贴上面那串连接串
4. 点 **Save Changes** → Render 会**自动重新部署**。
5. 部署完成后看 Logs，应出现 `✅ 已连接 Postgres 持久化数据库（重部署数据不丢失）`。首次启动会自动建表并载入创始账号 + 49 条种子事项。

> 其他选择：Supabase（免费 Postgres，Connection string 在 Settings → Database → URI）、或 Render 自家的 Postgres 插件（**付费**）。连接串填法相同。

### 已接入数据库后

- 之后**改代码 redeploy 数据都在**，无需再担心丢失。
- 仍然建议偶尔用应用内「⬇ 导出数据」留个本地备份，双保险。

---

## 🛠 部署后想改代码怎么办

改完本地文件后，重新 `git push` 到 GitHub，Render 会**自动检测并重新部署**（也可在面板点「Manual Deploy」）。

- **已接入 `DATABASE_URL`**：redeploy 数据不丢，放心改。
- **未接入（文件模式）**：redeploy 会重置数据库（仅剩创始账号 + 49 条种子），重要数据请先「导出数据」。

---

## 🆘 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 打开链接是白页 / 一直转圈 | 后端没起来。看 Render 面板 Logs 有无报错；确认 Start Command 是 `node server.js` |
| 注册后没出现在待审列表 | 确认你用的是**创始账号** `sidfeng@summit-pines.com` 登录，且角色是 founder |
| 别人登录看到我的事项 | 不会。每个账号数据独立隔离，这是设计内的 |
| 密码提示不合法 | 必须是 **6 位及以上纯数字**（如 123456），字母或不足 6 位会被拒 |
| 链接访问慢 | 免费版实例 15 分钟无访问会休眠，首次唤醒约需 30 秒，属正常 |
