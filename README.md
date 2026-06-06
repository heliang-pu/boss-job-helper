# Boss 直聘自动求职助手

Chrome/Edge 扩展 + 本地 FastAPI 服务，用于根据 PDF/DOCX 简历匹配 Boss 直聘岗位，并执行可控的自动沟通/投递流程。

## Safety Boundary

- 只支持当前用户登录后可见的 Boss 直聘网页内容。
- 遇到验证码、人机验证、登录异常、账号异常、未知弹窗或页面结构未知时暂停。
- 不做验证码绕过、风控规避、浏览器指纹隐藏或无限制批量投递。

## Components

- `apps/extension`: Chrome/Edge Manifest V3 扩展。
- `apps/local-service`: 本地 FastAPI 服务。
- `packages/shared-schema`: TypeScript 数据契约。

## Development

See [docs/dev-runbook.md](docs/dev-runbook.md).
