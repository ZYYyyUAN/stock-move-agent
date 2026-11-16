import type { Dataset, FactorCandidate, StockEvent } from '../types'
import { getCloseTimestamp, mapEvent } from './eventMapping'

export interface ExplainedFactor extends FactorCandidate {
  relationship: '因果假设'
  verification: '尚未证实'
  confidence: '中' | '低'
  confidenceReason: string
  references: {
    eventId: string
    sourceId: string
    assertion: StockEvent['assertion']
    evidenceIds: string[]
  }[]
}

export interface Explanation {
  tradingDate: string | null
  cutoff: string | null
  status: 'ready' | 'no-factors' | 'no-market-data' | 'unmapped'
  temporalRelation: '时间相关性'
  limitation: string
  factors: ExplainedFactor[]
}

/** 只消费已校验的数据；证据不足是结果状态，不是格式错误。 */
export function explainDate(dataset: Dataset, tradingDate: string | null): Explanation {
  const result: Explanation = {
    tradingDate, cutoff: null, status: 'unmapped', factors: [],
    temporalRelation: '时间相关性',
    limitation: '同日归组仅说明日级时间相关性；没有分钟行情或对照分析，不能确认消息导致全日涨跌。',
  }
  if (tradingDate === null) return result
  if (!dataset.candles.some(candle => candle.date === tradingDate)) {
    return { ...result, status: 'no-market-data' }
  }

  const cutoff = getCloseTimestamp(tradingDate, dataset.market)
  const eventById = new Map(dataset.events.map(event => [event.id, event]))
  const sourceById = new Map(dataset.sources.map(source => [source.id, source]))
  const financialById = new Map(dataset.financials.map(financial => [financial.id, financial]))
  const factors: ExplainedFactor[] = []

  for (const candidate of dataset.factors.filter(factor => factor.tradingDate === tradingDate)) {
    const events = candidate.eventIds.map(id => eventById.get(id)!)
    const eventsAvailable = events.every(event => {
      const mapping = mapEvent(event.publishedAt, dataset)
      return mapping.tradingDate === tradingDate
        && Date.parse(event.publishedAt) <= cutoff
        && Date.parse(sourceById.get(event.sourceId)!.publishedAt) <= cutoff
    })
    if (!eventsAvailable) continue

    const financialIds = [...new Set([...candidate.financialIds, ...events.flatMap(event => event.financialIds)])]
    const financialsAvailable = financialIds.every(id => {
      const financial = financialById.get(id)!
      return Date.parse(financial.publishedAt) <= cutoff
        && Date.parse(sourceById.get(financial.sourceId)!.publishedAt) <= cutoff
    })
    if (!financialsAvailable) continue

    const directEvidence = events.every(event => event.assertion === 'fact'
      && (event.type === 'announcement' || event.type === 'financial') && event.evidenceIds.length > 0)
    factors.push({
      ...candidate, financialIds,
      relationship: '因果假设', verification: '尚未证实',
      confidence: directEvidence ? '中' : '低',
      confidenceReason: directEvidence
        ? '关联事件均为有原文证据的公司直接披露；置信度仅表示材料支持程度，不能确认价格因果。'
        : '存在观点、间接材料或缺少直接证据；缺少支持价格因果关系的关键材料。',
      references: events.map(event => ({
        eventId: event.id, sourceId: event.sourceId, assertion: event.assertion,
        evidenceIds: [...event.evidenceIds],
      })),
    })
  }

  factors.sort((left, right) => left.priority - right.priority)
  return {
    ...result, cutoff: new Date(cutoff).toISOString(),
    status: factors.length > 0 ? 'ready' : 'no-factors', factors: factors.slice(0, 3),
  }
}
