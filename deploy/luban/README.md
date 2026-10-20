# Luban 部署准备

状态：本地准备，尚未部署。此镜像复用已有 Render/Node 适配，不会发布到 Render。

## 构建与实例

在项目根目录执行：

```sh
docker build -f deploy/luban/Dockerfile -t firefly-feedback:luban .
```

Luban 构建上下文使用项目根目录，Dockerfile 使用 `deploy/luban/Dockerfile`。
容器端口 3000；启动命令由镜像指定；readiness `/api/health`（检查数据库），liveness 使用 TCP 3000，避免数据库故障引发重启循环。数据库初始化使用单独的受控任务，不在每个副本启动时自动执行。

## 必须先确认的资源

- Luban 所属 System、战队、测试环境和公司代码仓库/镜像仓库。
- PostgreSQL 连接，由 Luban 密钥配置注入 `DATABASE_URL` 或 `PGHOST/PGUSER/PGDATABASE/PGPORT/PGPASSWORD`；当前适配要求 TLS，不关闭证书验证。
- 新的空数据库可参考 `deploy/render/schema.sql`，需先审核其 Supabase 专用权限语句；不得直接对已有公司库执行。数据、附件和历史均未自动迁移。
- 当前附件适配依赖 Supabase；公司对象存储尚未接入，不应把公司数据迁至外部服务来绕过该步骤。
- 当前 Node 适配固定为公开只读逻辑，并非公司登录，**不得直接对外暴露**。接入公司认证网关并完成授权前，只能用于隔离环境验证，不应导入真实反馈或作为正式上线版本。
- `PUBLIC_DATA_OWNER` 必须与迁移数据的 owner 对应。正式团队共享权限及可写模式需要单独实现和验证。

## 验证

本地运行 `node tests/postgres.mjs`、`node node_modules/typescript/bin/tsc --noEmit` 和 `pnpm build:render`。
镜像构建、公司数据库连接、公司登录、附件存储和部署后的端到端检查尚待完成。

### 本次验证结果

2026-10-20：PostgreSQL 兼容性测试、TypeScript 检查、Node 生产构建通过；生产启动命令可启动服务。未配置数据库时 `/api/health` 返回 500（预期未就绪），写接口返回 403（现有只读模式）。本机没有 Docker，未执行镜像构建。Luban 已登录，新建服务表单已填写名称和描述，等待确认所属 System，尚未提交。
