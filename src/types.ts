import { z } from 'zod'

const text = z.string().min(1).regex(/\S/, '文本不得仅含空白')
const date = z.iso.date()
const timestamp = z.iso.datetime({ offset: true })
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const ids = z.array(text)

export const datasetSchema = z.strictObject({
  market: z.strictObject({
    stockId: text,
    name: text,
    simulated: z.literal(true),
    timezone: z.literal('Asia/Shanghai'),
    priceUnit: z.literal('分'),
    sessions: z.array(z.strictObject({
      open: z.iso.time({ precision: 0 }),
      close: z.iso.time({ precision: 0 }),
    })).min(1),
    previousClose: z.strictObject({ date, close: amount }),
  }),
  calendar: z.strictObject({
    coverageStart: date,
    coverageEnd: date,
    days: z.array(z.strictObject({ date, isTradingDay: z.boolean(), reason: text })).min(1),
  }),
  candles: z.array(z.strictObject({
    date,
    open: amount,
    high: amount,
    low: amount,
    close: amount,
    volume: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })),
  events: z.array(z.strictObject({
    id: text,
    stockId: text,
    title: text,
    publishedAt: timestamp,
    type: z.enum(['announcement', 'news', 'industry', 'financial']),
    assertion: z.enum(['fact', 'opinion']),
    sourceId: text,
    summary: text,
    evidenceIds: ids,
    financialIds: ids,
  })),
  sources: z.array(z.strictObject({
    id: text,
    simulated: z.literal(true),
    publisher: text,
    title: text,
    publishedAt: timestamp,
    sections: z.array(z.strictObject({ sectionId: text, text })).min(1),
  })),
  evidence: z.array(z.strictObject({
    id: text,
    eventId: text,
    sourceId: text,
    sectionId: text,
    quote: text,
  })),
  financials: z.array(z.strictObject({
    id: text,
    stockId: text,
    period: text,
    metric: text,
    value: z.number().finite(),
    unit: text,
    comparison: z.strictObject({ period: text, value: z.number().finite() }),
    publishedAt: timestamp,
    sourceId: text,
  })),
  factors: z.array(z.strictObject({
    id: text,
    tradingDate: date,
    eventIds: ids.min(1),
    financialIds: ids,
    claim: text,
    mechanism: text,
    limitations: z.array(text).min(1),
    priority: z.number().int().positive(),
  })),
})

export type Dataset = z.infer<typeof datasetSchema>
export type Market = Dataset['market']
export type Calendar = Dataset['calendar']
export type Candle = Dataset['candles'][number]
export type StockEvent = Dataset['events'][number]
export type Source = Dataset['sources'][number]
export type Evidence = Dataset['evidence'][number]
export type Financial = Dataset['financials'][number]
export type FactorCandidate = Dataset['factors'][number]
