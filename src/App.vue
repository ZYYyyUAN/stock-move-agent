<script setup lang="ts">
import { computed, ref } from 'vue'
import PriceChart from './components/PriceChart.vue'
import EventTimeline from './components/EventTimeline.vue'
import EventDetails from './components/EventDetails.vue'
import AgentAssistant from './components/AgentAssistant.vue'
import { calculatePriceChanges } from './domain/anomaly'
import { mapEvents } from './domain/eventMapping'
import { explainDate } from './domain/explain'
import { loadDataset } from './domain/loadDataset'

const dataset = loadDataset()
const mappedEvents = mapEvents(dataset)
const priceChanges = calculatePriceChanges(dataset)
const initialDate = priceChanges.find(change => change.status === 'calculated' && change.isAnomaly)!.date
const selection = ref({
  tradingDate: initialDate as string | null,
  eventId: mappedEvents.find(item => item.mapping.tradingDate === initialDate)!.event.id as string | null,
  evidenceId: null as string | null,
})
const agentExpanded = ref(true)
const selectedEvent = computed(() => mappedEvents.find(item => item.event.id === selection.value.eventId) ?? null)
const explanation = computed(() => explainDate(dataset, selection.value.tradingDate))

function selectDate(tradingDate: string) {
  if (tradingDate === selection.value.tradingDate) return
  selection.value = {
    tradingDate,
    eventId: mappedEvents.find(item => item.mapping.tradingDate === tradingDate)?.event.id ?? null,
    evidenceId: null,
  }
}

function selectEvent(eventId: string, evidenceId: string | null = null) {
  const item = mappedEvents.find(item => item.event.id === eventId)!
  selection.value = { tradingDate: item.mapping.tradingDate, eventId, evidenceId }
}
</script>

<template>
  <main class="workspace">
    <header class="workspace-header">
      <p class="eyebrow">股价异动解释 Agent · 全部为模拟数据</p>
      <h1>{{ dataset.market.name }} <span>{{ dataset.market.stockId }}</span></h1>
      <p>交易所时区 {{ dataset.market.timezone }} · 行情 {{ dataset.candles[0].date }} 至 {{ dataset.candles.at(-1)!.date }}</p>
    </header>
    <div class="workspace-columns">
      <div class="research-column">
        <PriceChart :candles="dataset.candles" :changes="priceChanges" :selected-date="selection.tradingDate" @select-date="selectDate" />
        <EventTimeline :items="mappedEvents" :selected-date="selection.tradingDate" :selected-event-id="selection.eventId" @select-event="selectEvent" />
      </div>
      <aside class="context-column">
        <EventDetails
          :key="selection.eventId ?? 'no-event'"
          :dataset="dataset" :item="selectedEvent" :evidence-id="selection.evidenceId"
          @select-evidence="evidenceId => selectEvent(selection.eventId!, evidenceId)"
        />
        <AgentAssistant
          :dataset="dataset" :explanation="explanation" :expanded="agentExpanded"
          @toggle="agentExpanded = !agentExpanded" @select-reference="selectEvent"
        />
      </aside>
    </div>
  </main>
</template>
