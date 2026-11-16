# 股价异动解释 Agent

单只虚构股票“澄川科技”的本地模拟演示。当前已实现 **P1 工程与数据、P2 业务规则**，规则通过单元测试验证，页面仍仅显示数据加载概况。K 线、事件、证据与助手之间的界面联动留到 P3。

## 环境与运行

已验证 Node.js `24.16.0`、npm `11.14.1`。依赖精确版本写入 `package.json`，完整解析结果写入 `package-lock.json`。

```sh
npm ci
npm run dev
```

开发服务绑定 `127.0.0.1`，终端显示实际访问地址。首次安装需要网络或依赖缓存；运行时数据和资源均来自项目本地。断外网验收留到 P6，当前不声称已经完成。

```sh
npm run typecheck
npm run test
npm run build
npm run preview
```

`build` 先进行类型检查，再生成 `dist/`；产物通过本地 HTTP 服务打开，不支持双击 HTML 的启动约定。`dist/` 和依赖目录不提交，最终静态产物整理留到 P6。

`npm run test:e2e` 已配置为由 Playwright 构建并启动独占的 `127.0.0.1:4173` 预览服务。当前尚无浏览器测试，该命令不会产生通过结果；P6 实现关键流程测试时再准备浏览器运行环境。Vue Test Utils 及组件测试环境在 P3 按需安装。

## 已交付内容

- Vue 3、TypeScript、Vite 基础入口，ECharts 依赖和验证脚本。
- 19 个行情交易日、一个前收盘基准、36 天明确日历、14 条模拟事件及各自的来源原文和证据、3 条财务记录、6 个解释候选。
- `loadDataset(input?: unknown)` 是唯一数据校验入口，默认读取本地 JSON；返回校验后的 `Dataset`，失败统一抛出 `DatasetValidationError`，`issues` 保留点分字段路径与消息。内部业务模块应信任结果，不再重复校验。
- 空行情、空事件、缺少直接证据均可作为合法输入；无效时间、OHLC、日历或引用直接报错，不修复或跳过记录。
- P2：`eventMapping` 按显式交易所时区转换、绝对时刻排序和日历映射；区分缺少行情与日历不足。
- P2：`anomaly` 按真正的前一交易日计算涨跌幅，以整数交叉相乘判定绝对值至少 5%；固定故事的异动日为 `03-09` +9%、`03-13` −8%。
- P2：`explainDate` 按收盘截止检查事件、来源和财务披露，再按优先级最多输出 3 个固定因素；保留逐事件证据链接、事实／观点、低／中置信度和“尚未证实”。

所有公司、事件、发布者、数字和原文均为模拟材料。行情以整数分存储，财务记录保留自己的单位、报告期和首次披露时间。映射日期、涨跌幅、置信度与最终解释没有写入数据文件。

## 文档与阶段边界

- [实施计划](docs/implementation-plan.md)：P1～P6 范围及完成标准，严格顺序实施。
- [数据与规则约定](docs/data-rules.md)：字段、校验职责、后续规则约定与固定故事。
- [实际验收记录](docs/acceptance.md)：只记录实际执行的结果和审查状态。
- [可见对话记录](docs/agent-conversation.md)：标明节选、摘要、工具结果和记录范围。

下一批 P3 接入规则，完成四个主要区域的选择状态与引用联动、组件测试；P4 场景与边界提示、P5 视觉可用性和 P6 浏览器验收与交付保持原计划分工。

工程配置参考 [Vite 指南](https://vite.dev/guide/)、[Vue TypeScript 指南](https://vuejs.org/guide/typescript/overview.html)、[Vitest 指南](https://vitest.dev/guide/)、[Zod 文档](https://zod.dev/) 和 [Playwright webServer 文档](https://playwright.dev/docs/test-webserver)。
