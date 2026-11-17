<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use } from 'echarts/core'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { BarChart, CandlestickChart, ScatterChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Candle } from '../types'
import type { PriceChange } from '../domain/anomaly'
import { formatPercent, formatPrice } from '../presentation'

use([BarChart, CandlestickChart, ScatterChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])
const props = defineProps<{ candles: Candle[]; changes: PriceChange[]; selectedDate: string | null }>()
const emit = defineEmits<{ selectDate: [date: string] }>()
const chartElement = ref<HTMLDivElement>()
let chart: EChartsType
let resizeObserver: ResizeObserver
const selectedCandle = computed(() => props.candles.find(candle => candle.date === props.selectedDate))
const selectedChange = computed(() => props.changes.find(change => change.date === props.selectedDate))
const anomalyDates = computed(() => props.changes.filter(change => change.status === 'calculated' && change.isAnomaly).map(change => change.date))
const previousAnomaly = computed(() => anomalyDates.value.filter(date => props.selectedDate !== null && date < props.selectedDate).at(-1))
const nextAnomaly = computed(() => anomalyDates.value.find(date => props.selectedDate === null || date > props.selectedDate))
const option = computed<EChartsCoreOption>(() => ({
  animation: false,
  grid: [{ left: 58, right: 24, top: 36, height: '57%' }, { left: 58, right: 24, top: '77%', height: '15%' }],
  tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'cross' } },
  xAxis: [
    { type: 'category', data: props.candles.map(candle => candle.date), axisLabel: { formatter: (value: string) => value.slice(5) }, gridIndex: 0 },
    { type: 'category', data: props.candles.map(candle => candle.date), axisLabel: { show: false }, gridIndex: 1 },
  ],
  yAxis: [{ scale: true, name: '价格（元）', gridIndex: 0 }, { scale: true, name: '成交量', gridIndex: 1, splitNumber: 2 }],
  series: [
    {
      id: 'price', name: '日 K', type: 'candlestick',
      data: props.candles.map(candle => [candle.open, candle.close, candle.low, candle.high].map(value => value / 100)),
      itemStyle: { color: '#c64040', color0: '#21815b', borderColor: '#c64040', borderColor0: '#21815b' },
      markLine: {
        silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#285fbb', type: 'dashed' },
        data: selectedCandle.value ? [{ xAxis: props.selectedDate }] : [],
      },
    },
    {
      id: 'volume', name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
      data: props.candles.map(candle => ({ value: candle.volume, itemStyle: { color: candle.close >= candle.open ? '#c64040' : '#21815b' } })),
    },
    {
      id: 'anomalies', name: '演示异动', type: 'scatter', symbol: 'pin', symbolSize: 36,
      label: { show: true, formatter: '!', color: '#fff' },
      data: props.changes.flatMap(change => {
        if (change.status !== 'calculated' || !change.isAnomaly) return []
        const candle = props.candles.find(candle => candle.date === change.date)!
        return [{ name: change.date, value: [change.date, candle.high / 100 + 0.08], itemStyle: { color: change.changeRatio >= 0 ? '#c64040' : '#21815b' } }]
      }),
    },
  ],
}))
onMounted(() => {
  chart = init(chartElement.value!)
  chart.setOption(option.value)
  chart.on('click', params => {
    if (params.componentType === 'series') emit('selectDate', params.name)
  })
  resizeObserver = new ResizeObserver(() => chart.resize())
  resizeObserver.observe(chartElement.value!)
})
watch(option, value => chart.setOption(value))
onBeforeUnmount(() => {
  resizeObserver.disconnect()
  chart.dispose()
})
</script>

<template>
  <section class="panel price-panel" aria-labelledby="price-title">
    <div class="section-heading">
      <h2 id="price-title">行情与异动</h2>
      <div class="date-navigation">
        <button :disabled="!previousAnomaly" @click="emit('selectDate', previousAnomaly!)">前一异动日</button>
        <button :disabled="!nextAnomaly" @click="emit('selectDate', nextAnomaly!)">后一异动日</button>
      </div>
    </div>
    <label>选择交易日
      <select :value="selectedDate ?? ''" @change="emit('selectDate', ($event.target as HTMLSelectElement).value)">
        <option v-if="!selectedCandle" :value="selectedDate ?? ''" disabled>{{ selectedDate ?? '未映射日期' }}</option>
        <option v-for="candle in candles" :key="candle.date" :value="candle.date">{{ candle.date }}{{ anomalyDates.includes(candle.date) ? ' · 异动' : '' }}</option>
      </select>
    </label>
    <div class="price-summary" aria-live="polite">
      <strong>{{ selectedDate ?? '未映射日期' }}</strong>
      <template v-if="selectedCandle">
        <span>收盘 {{ formatPrice(selectedCandle.close) }} 元</span>
        <span v-if="selectedChange?.status === 'calculated'" :class="selectedChange.changeRatio >= 0 ? 'up' : 'down'">
          {{ selectedChange.changeRatio >= 0 ? '上涨' : '下跌' }} {{ formatPercent(selectedChange.changeRatio) }}{{ selectedChange.isAnomaly ? ' · 异动' : '' }}
        </span>
        <span>开 {{ formatPrice(selectedCandle.open) }} / 高 {{ formatPrice(selectedCandle.high) }} / 低 {{ formatPrice(selectedCandle.low) }}</span>
      </template>
      <span v-else>当前日期无对应行情</span>
    </div>
    <div ref="chartElement" class="price-chart" role="img" aria-label="日 K 线与成交量图，点击蜡烛或异动标记选择日期，也可使用上方日期控件" />
    <p class="muted">演示异动阈值：收盘涨跌幅绝对值 ≥ 5%。悬停查看行情，点击选择日期。</p>
  </section>
</template>
