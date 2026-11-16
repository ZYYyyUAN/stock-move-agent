import market from '../data/market.json'
import calendar from '../data/calendar.json'
import candles from '../data/candles.json'
import events from '../data/events.json'
import sources from '../data/sources.json'
import evidence from '../data/evidence.json'
import financials from '../data/financials.json'
import factors from '../data/factors.json'
import { datasetSchema } from '../types'
import type { Dataset } from '../types'

export interface DatasetIssue {
  path: string
  message: string
}

export class DatasetValidationError extends Error {
  constructor(public readonly issues: DatasetIssue[]) {
    super(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'))
    this.name = 'DatasetValidationError'
  }
}

/** 唯一数据边界；校验失败抛出带字段路径的标准错误，不修复或丢弃记录。 */
export function loadDataset(input: unknown = { market, calendar, candles, events, sources, evidence, financials, factors }): Dataset {
  const result = datasetSchema.safeParse(input)
  if (!result.success) {
    throw new DatasetValidationError(result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })))
  }
  const dataset = result.data
  const issues: DatasetIssue[] = []
  const issue = (path: (string | number)[], message: string) =>
    issues.push({ path: path.join('.'), message })

  // 同一入口内完成结构与关系校验，业务模块只接收校验后的 Dataset。
  const collections = ['events', 'sources', 'evidence', 'financials', 'factors'] as const
  for (const collection of collections) {
    const seen = new Set<string>()
    dataset[collection].forEach((record, index) => {
      if (seen.has(record.id)) issue([collection, index, 'id'], `重复 ID：${record.id}`)
      seen.add(record.id)
    })
  }

  const { coverageStart, coverageEnd, days } = dataset.calendar
  if (coverageStart > coverageEnd) issue(['calendar', 'coverageEnd'], '不得早于 coverageStart')
  let expectedDate = coverageStart
  days.forEach((day, index) => {
    if (day.date !== expectedDate) issue(['calendar', 'days', index, 'date'], `需要连续且唯一的日期：${expectedDate}`)
    const next = new Date(`${day.date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    expectedDate = next.toISOString().slice(0, 10)
  })
  if (days.at(-1)!.date !== coverageEnd) issue(['calendar', 'coverageEnd'], '必须与最后一个日历日期一致')
  const tradingDates = new Set(days.filter(day => day.isTradingDay).map(day => day.date))

  const sessions = dataset.market.sessions
  sessions.forEach((session, index) => {
    if (session.open >= session.close) issue(['market', 'sessions', index, 'close'], '必须晚于开盘时间')
    if (index > 0 && session.open <= sessions[index - 1].close) {
      issue(['market', 'sessions', index, 'open'], '交易时段必须升序且不重叠')
    }
  })

  if (!tradingDates.has(dataset.market.previousClose.date)) {
    issue(['market', 'previousClose', 'date'], '前收盘基准必须属于日历中的交易日')
  }
  dataset.candles.forEach((candle, index) => {
    const path = ['candles', index]
    if (!tradingDates.has(candle.date)) issue([...path, 'date'], '行情日期必须属于日历中的交易日')
    const previousDate = index === 0 ? dataset.market.previousClose.date : dataset.candles[index - 1].date
    if (candle.date <= previousDate) issue([...path, 'date'], '行情日期必须唯一、升序并晚于前收盘基准')
    if (candle.low > candle.high) issue([...path, 'low'], '最低价不得高于最高价')
    if (candle.open < candle.low || candle.open > candle.high) issue([...path, 'open'], '开盘价必须位于最低价和最高价之间')
    if (candle.close < candle.low || candle.close > candle.high) issue([...path, 'close'], '收盘价必须位于最低价和最高价之间')
  })

  const sourceById = new Map(dataset.sources.map(source => [source.id, source]))
  const eventById = new Map(dataset.events.map(event => [event.id, event]))
  const evidenceById = new Map(dataset.evidence.map(item => [item.id, item]))
  const financialById = new Map(dataset.financials.map(item => [item.id, item]))

  dataset.sources.forEach((source, index) => {
    const sectionIds = new Set<string>()
    source.sections.forEach((section, sectionIndex) => {
      if (sectionIds.has(section.sectionId)) issue(['sources', index, 'sections', sectionIndex, 'sectionId'], '原文段落 ID 必须在来源内唯一')
      sectionIds.add(section.sectionId)
    })
  })
  dataset.events.forEach((event, index) => {
    const path = ['events', index]
    if (event.stockId !== dataset.market.stockId) issue([...path, 'stockId'], '必须引用当前模拟股票')
    if (!sourceById.has(event.sourceId)) issue([...path, 'sourceId'], '来源不存在')
    event.evidenceIds.forEach((id, referenceIndex) => {
      const item = evidenceById.get(id)
      if (!item || item.eventId !== event.id || item.sourceId !== event.sourceId) {
        issue([...path, 'evidenceIds', referenceIndex], '证据必须存在且属于该事件及来源')
      }
    })
    event.financialIds.forEach((id, referenceIndex) => {
      if (!financialById.has(id)) issue([...path, 'financialIds', referenceIndex], '财务数据不存在')
    })
  })
  dataset.evidence.forEach((item, index) => {
    const path = ['evidence', index]
    const event = eventById.get(item.eventId)
    if (!event || !event.evidenceIds.includes(item.id) || event.sourceId !== item.sourceId) {
      issue([...path, 'eventId'], '必须引用关联该证据且来源一致的事件')
    }
    const source = sourceById.get(item.sourceId)
    if (!source) {
      issue([...path, 'sourceId'], '来源不存在')
      return
    }
    const section = source.sections.find(section => section.sectionId === item.sectionId)
    if (!section) {
      issue([...path, 'sectionId'], '来源中不存在该段落')
      return
    }
    if (!section.text.includes(item.quote)) issue([...path, 'quote'], '引文必须能在指定原文段落中找到')
  })
  dataset.financials.forEach((item, index) => {
    if (item.stockId !== dataset.market.stockId) issue(['financials', index, 'stockId'], '必须引用当前模拟股票')
    if (!sourceById.has(item.sourceId)) issue(['financials', index, 'sourceId'], '来源不存在')
  })
  dataset.factors.forEach((factor, index) => {
    const path = ['factors', index]
    if (!tradingDates.has(factor.tradingDate)) issue([...path, 'tradingDate'], '候选日期必须属于日历中的交易日')
    factor.eventIds.forEach((id, referenceIndex) => {
      if (!eventById.has(id)) issue([...path, 'eventIds', referenceIndex], '事件不存在')
    })
    factor.financialIds.forEach((id, referenceIndex) => {
      if (!financialById.has(id)) issue([...path, 'financialIds', referenceIndex], '财务数据不存在')
    })
  })
  if (issues.length > 0) throw new DatasetValidationError(issues)
  return dataset
}
