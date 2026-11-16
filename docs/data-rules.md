# 数据与规则约定

日期：2026-11-16（Asia/Shanghai）。本文件记录 P1 数据契约与 P2 已实现的计算规则；界面尚未接入，详细阶段边界以 [实施计划](implementation-plan.md) 为准。

## 已实现：P1 数据契约

固定数据位于 `src/data/`，由 `src/types.ts` 中的 Zod schema 同时定义字段与 TypeScript 类型。`src/domain/loadDataset.ts` 在加载边界一次完成结构和跨记录关系校验。没有默认字段填充、自动转型、trim、静默丢弃或格式修复；失败统一抛出 `DatasetValidationError`。

| 文件 | 字段与约束 |
|---|---|
| `market.json` | `stockId/name/simulated/timezone/priceUnit/sessions/previousClose`；模拟单股、`Asia/Shanghai`、整数分，明确前一交易日基准与交易时段 |
| `calendar.json` | `coverageStart/coverageEnd/days`；范围内逐日连续、唯一且升序，每日明确 `isTradingDay/reason`，起止与实际记录一致 |
| `candles.json` | `date/open/high/low/close/volume`；正安全整数分、非负安全整数成交量；OHLC 关系合法；日期唯一、升序、属于日历交易日且晚于前收盘基准 |
| `events.json` | `id/stockId/title/publishedAt/type/assertion/sourceId/summary/evidenceIds/financialIds`；引用存在；证据归属当前事件与来源 |
| `sources.json` | `id/simulated/publisher/title/publishedAt/sections`；模拟标识为真，原文段落非空，`sectionId` 在单个来源内唯一 |
| `evidence.json` | `id/eventId/sourceId/sectionId/quote`；双向事件关联、来源与段落存在且一致，引文是指定段落的原样子串 |
| `financials.json` | `id/stockId/period/metric/value/unit/comparison/publishedAt/sourceId`；数值有限，`comparison` 含自身 `period/value`；来源与股票有效 |
| `factors.json` | `id/tradingDate/eventIds/financialIds/claim/mechanism/limitations/priority`；至少关联一个现有事件，财务引用存在，日期为日历交易日，优先级为正整数 |

事件类型取值为 `announcement/news/industry/financial`，陈述类型为 `fact/opinion`。全部 ID 在各自集合内唯一。事件、来源和财务的时间均为带 `Z` 或数字偏移的 ISO 日期时间，不能依赖运行机器的时区。金额和原文中的财务数字使用各自标明的单位，不能把财务“元”当作行情“分”。

异常位置示例：`events.0.publishedAt`、`candles.0.low`、`evidence.0.quote`。`issues` 可以一次报告多处错误；格式错误和业务上证据不足分开处理。空行情可保留事件；空事件时其证据和候选等引用也须同步清空。没有直接证据的观点允许保留，加载入口不替解释规则决定置信度。

## 已实现：固定故事材料

行情范围为 `2026-03-02`～`2026-03-27`，共 19 个交易日。前收盘基准为 `02-27` 收盘 980 分。模拟日历覆盖 `02-27`～`04-03` 共 36 天，周末及明确的 `03-18` 模拟休市日均有记录；它不代表真实交易所日历。

| 材料 | 当前数据 | P2 单元测试验证的结果 |
|---|---|---|
| 上涨故事 | `03-06` 1000 分、`03-09` 1090 分；`evt-earnings/evt-industry/evt-order` | `03-09` +9%，盘后和周末事件归入 `03-09` |
| 下跌故事 | `03-12` 1100 分、`03-13` 1012 分；订单取消公告和模拟评论 | `03-13` −8%，有直接材料和弱证据候选 |
| 未来事件 | `evt-followup` 于 `03-13` 16:00 发布 | 不进入 `03-13` 收盘解释 |
| 未来财务 | `fin-order-profit` 的报告期为 `2026-Q1`，首次披露为 `03-13` 16:00；候选同时可引用早前事件 | 即使早前事件已知，仍按财务首次披露时间排除 |
| UTC 与午休 | `evt-order` 使用 `Z`，`evt-midday` 当地 12:00 | 显式转换时区；午休归当日 |
| 收盘边界 | `evt-close` 使用 `2026-03-24T07:00:00Z` | 恰好当地 15:00 归当日 |
| 明确休市 | `evt-holiday` 于 `03-18` 10:00 发布 | 归 `03-19`，不按工作日推断 |
| 行情范围外 | `evt-outside` 于 `03-27` 16:00 发布 | 映射 `03-30`，但无对应行情 |
| 日历不足 | `evt-calendar` 于 `04-03` 16:00 发布 | 无法映射，不猜测下一个交易日 |
| 普通日期 | `03-03` 有行情且无当天事件 | 后续界面能显示无事件状态 |

每条来源含模拟声明及 `body` 原文段落，每条证据引用 `body` 中的原文。评论也有可核对的出处，但“有引文”不等于“有支持价格因果的直接证据”。6 个候选中的 2 个特意关联未来材料，P2 已验证它们被截止时间规则排除；它们是合法候选数据，不应由加载层删掉。

## 已实现：P2 计算规则

- 涨跌幅为 `(close - previousClose) / previousClose`；演示异动条件为绝对值至少 5%，比较使用整数交叉相乘，显示时再保留两位小数。
- 时间先解析为绝对时刻，再显式转换为 `Asia/Shanghai`；排序也按绝对时刻。模拟交易时段为 `09:30–11:30`、`13:00–15:00`，盘前、盘中、午休和恰好 15:00 归当日，盘后及休市日归日历中下一交易日；覆盖不足不能猜测。
- 解释截止所选交易日收盘；事件、来源和财务首次披露均不得晚于截止时间。默认仅使用映射至当日的事件，旧报告期不豁免披露时间限制。
- 对符合时间和证据约束的固定候选按优先级取最多 3 个；两个主要异动日各保留 1～3 个。无合格因素时不补造。只有观点或缺少关键材料时低置信度，具体直接材料可为中，本版没有高置信度；因果假设一律标“尚未证实”。

| 模块与入口 | 返回与职责 |
|---|---|
| `eventMapping.toExchangeTime(publishedAt, timezone)` | 交易所当地 `date/time`；ISO 时间先解析为绝对时刻，再用 `Intl.DateTimeFormat.formatToParts` 和显式时区提取分量，保留毫秒边界 |
| `eventMapping.getCloseTimestamp(tradingDate, market)` | 根据最后一个交易时段的收盘时间和交易所时区得到绝对截止时刻，不使用宿主时区 |
| `eventMapping.mapEvent(publishedAt, dataset)` | `mapped/unmapped`、`tradingDate`、当地日期时间、映射原因及 `hasCandle`；日期不在日历中或没有下一交易日时返回 `calendar-insufficient` |
| `eventMapping.mapEvents(dataset)` | 按绝对发布时间升序返回事件和映射结果，不修改原数组 |
| `anomaly.calculatePriceChange(close, previousClose)` | 未舍入的 `changeRatio` 与 `isAnomaly`；阈值用 `BigInt` 交叉相乘，合法安全整数价格的乘积也不损失精度 |
| `anomaly.calculatePriceChanges(dataset)` | 按行情顺序返回日期、前一交易日和计算结果；前一交易日行情缺失时为 `missing-previous-close`，不拿更早的价格替代。无行情时返回空数组 |
| `explain.explainDate(dataset, tradingDate)` | 收盘截止 ISO 时间、解释边界及因素；状态为 `ready/no-factors/no-market-data/unmapped`。无行情或日期为空时不输出因素 |

这些入口属于加载边界内的领域模块，只消费已由 `loadDataset` 校验的输入，不再次校验字段或引用。`changeRatio` 是比例，例如 `0.09` 表示 +9%；两位小数是后续界面的显示职责，不参与阈值判断。前收盘基准只在它确为该日的前一交易日时使用。

映射原因分别为 `before-open`（盘前）、`session`（盘中）、`midday-break`（午间休市）、`close`（恰好收盘）、`after-close`（盘后）、`non-trading-day`（非交易日）。盘后与非交易日只查显式日历；映射成功但 `hasCandle: false` 不等于日历不足。

解释规则检查候选的全部事件、事件来源，以及候选和事件各自关联的全部财务记录与财务来源。任一相关材料晚于截止时间，就排除整个候选；证据引用的来源已由加载契约保证与事件来源一致，沿用同一截止时间检查。事件还必须映射到所选日，不自动引入更早背景。过滤后才按 `priority` 升序取最多 3 个，同优先级保留候选输入顺序。

置信度采用固定可复现的分档：全部关联事件都为事实、类型为公司公告或财务披露且各自有原文证据时为“中”；包含观点、新闻／行业间接材料或无直接引文时为“低”。原有候选局限、作用机制和逐事件 `references` 均保留；引用包含 `eventId/sourceId/assertion/evidenceIds`，财务 ID 合并去重。评论即使有引文仍为低；缺少引文也不丢弃合法候选，而是明确证据缺口。本规则不根据自由文本猜测因果，所有因素固定为“因果假设／尚未证实”。

默认结果：`03-09` 输出 `factor-earnings`（中）与 `factor-industry`（低）；`03-13` 输出 `factor-order-cancel`（中）与 `factor-comment`（低）。未来事件、未来财务和它们的引用不进入 `03-13` 输出。`03-03` 返回 `no-factors`，`03-30` 返回 `no-market-data`，无法映射的事件将空日期传给规则时返回 `unmapped`。

同日归组仅说明日级时间相关性。没有分钟行情或对照分析，不能确认消息导致全日涨跌。本版不处理复权、除权、停牌、不同市场涨跌幅限制或自动跨日背景检索。P3 的联动、P4 的场景控件、P5 的视觉可用性和 P6 的浏览器交付仍按原计划执行。
