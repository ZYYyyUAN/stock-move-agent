import { describe, expect, it } from 'vitest'
import { calculatePriceChange, calculatePriceChanges } from '../../src/domain/anomaly'
import { loadDataset } from '../../src/domain/loadDataset'

describe('演示异动阈值', () => {
  it.each([
    [1050, 1000, 0.05, true],
    [950, 1000, -0.05, true],
    [1049, 1000, 0.049, false],
    [951, 1000, -0.049, false],
    [1000, 1000, 0, false],
  ])('收盘 %i / 前收 %i', (close, previousClose, changeRatio, isAnomaly) => {
    expect(calculatePriceChange(close, previousClose)).toEqual({ changeRatio, isAnomaly })
  })

  it('大额整数分仍精确比较阈值，不先四舍五入百分比', () => {
    const previousClose = 8_000_000_000_000_000
    expect(calculatePriceChange(8_400_000_000_000_000, previousClose).isAnomaly).toBe(true)
    expect(calculatePriceChange(8_399_999_999_999_999, previousClose).isAnomaly).toBe(false)
    expect(calculatePriceChange(7_600_000_000_000_000, previousClose).isAnomaly).toBe(true)
    expect(calculatePriceChange(7_600_000_000_000_001, previousClose).isAnomaly).toBe(false)
  })

  it('指定上涨 +9% 和下跌 −8% 正确，并使用首日前收盘基准', () => {
    const dataset = loadDataset()
    const before = structuredClone(dataset)
    const changes = calculatePriceChanges(dataset)
    expect(changes).toHaveLength(19)
    expect(changes[0]).toMatchObject({ status: 'calculated', previousDate: '2026-02-27', previousClose: 980, isAnomaly: false })
    expect(changes.find(item => item.date === '2026-03-09')).toEqual({
      status: 'calculated', date: '2026-03-09', previousDate: '2026-03-06',
      previousClose: 1000, changeRatio: 0.09, isAnomaly: true,
    })
    expect(changes.find(item => item.date === '2026-03-13')).toEqual({
      status: 'calculated', date: '2026-03-13', previousDate: '2026-03-12',
      previousClose: 1100, changeRatio: -0.08, isAnomaly: true,
    })
    expect(changes.filter(item => item.status === 'calculated' && item.isAnomaly).map(item => item.date))
      .toEqual(['2026-03-09', '2026-03-13'])
    expect(dataset).toEqual(before)
  })

  it('明确休市之后使用真正的前一交易日', () => {
    const changes = calculatePriceChanges(loadDataset())
    expect(changes.find(item => item.date === '2026-03-19')).toMatchObject({ status: 'calculated', previousDate: '2026-03-17' })
  })

  it('前一交易日缺行情时不拿更早价格替代', () => {
    const input = loadDataset()
    input.candles = input.candles.filter(candle => candle.date !== '2026-03-06')
    const changes = calculatePriceChanges(loadDataset(input))
    expect(changes.find(item => item.date === '2026-03-09')).toEqual({
      status: 'missing-previous-close', date: '2026-03-09', previousDate: '2026-03-06',
    })
  })

  it('空行情没有计算结果', () => {
    const input = loadDataset()
    input.candles = []
    expect(calculatePriceChanges(loadDataset(input))).toEqual([])
  })
})
