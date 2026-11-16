<script setup lang="ts">
import { loadDataset } from './domain/loadDataset'

const dataset = loadDataset()
</script>

<template>
  <main>
    <p>模拟数据 · 工程与数据阶段</p>
    <h1>股价异动解释 Agent</h1>
    <p>{{ dataset.market.name }}（{{ dataset.market.stockId }}）</p>
    <dl>
      <dt>交易所时区</dt><dd>{{ dataset.market.timezone }}</dd>
      <dt>行情记录</dt><dd>{{ dataset.candles.length }} 个交易日</dd>
      <dt>模拟事件</dt><dd>{{ dataset.events.length }} 条</dd>
    </dl>
    <p>本地数据已通过加载校验。业务规则与交互将在后续批次完成。</p>
  </main>
</template>
