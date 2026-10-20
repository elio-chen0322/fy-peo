# fy-peo

PEO 用户原声、诉求与审核协作工作台。

部署架构：**GitHub Pages 静态前端 + Supabase Auth、数据库、Storage、Edge Functions**，无需 Render。

完整步骤见 [部署说明](deploy/pages/README.md)。

- `pnpm build:pages`：构建静态网站。
- `pnpm build:edge`：构建 Supabase 后台。
- `node tests/edge.mjs`：验证后台权限、数据读写和冲突保护。
- GitHub Actions 中手动运行 **Publish PEO test site** 发布网站。

本地原有开发流程和数据保留。线上功能须完成 Supabase 配置、组员授权和数据迁移后验证，源码上传不代表迁移完成。
