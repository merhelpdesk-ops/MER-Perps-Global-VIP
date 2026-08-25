# Orderly VIP Fee Manager

面向 Orderly Builder Admin 的前端费率管理工具。支持 Admin API Key 验证、完整账户分页、按交易量匹配 Perp 与 RWA Maker/Taker 四种费率、人工复核及全量自动扫描。

## Run

```bash
yarn install
yarn dev
```

生产构建：`yarn build`。

## Authentication & storage

- 登录需要 Orderly Account ID 和对应的 32-byte Ed25519 私钥（hex 或 base58）。公钥由浏览器本地推导。
- App 通过仅 Builder Admin 可访问的 `/v1/broker/fee_rate/default` 验证权限。
- 登录成功后通过 `/v1/public/account?account_id=...` 自动读取并预填该账户注册的 Broker ID。
- 勾选保存登录后，凭据保存在当前浏览器 `localStorage`。这便于个人管理，但不等同于操作系统密钥库；共享设备请勿启用。
- Broker ID、日期、分页大小和四维费率档位可独立保存到 `localStorage`。

## API behavior

- 交易量：分页读取 `GET /v1/broker/leaderboard/daily`，使用 `aggregateBy=address` 汇总钱包地址在所选 Broker 下的交易量，并按规范化后的地址关联账户；日期范围最多 90 天。
- 完整账户及当前四种费率：分页读取 `GET /v1/broker/user_info`。
- “Refresh current page” 刷新当前账户页；“Auto scan all accounts” 遍历所有页并仅保留需要调整的账户。
- 账户行按匹配到的交易量档位着色，可勾选 “Needs modification only” 过滤。
- 更新费率：`POST /v1/broker/fee_rate/set`；相同目标费率自动分组，每批最多 500 个账户，并按 1 request/second 节流。
- 费率在 UI 中用百分比显示，发送给 API 时转换为 decimal rate。
- 所有费率输入及最终 JSON payload 都量化到 `0.000001` decimal-rate 的整数倍；UI 中对应的步长是 `0.0001%`。例如 UI 的 `0.15%` 会发送为 `0.0015`。
