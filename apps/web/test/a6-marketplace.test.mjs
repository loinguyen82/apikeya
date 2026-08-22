import assert from 'node:assert/strict'
import test from 'node:test'
import {
  convertA6MarketplacePriceToVnd,
  findA6MarketplaceItem,
  parseA6MarketplaceItems,
} from '../src/lib/a6-marketplace.ts'

test('parses and converts A6 marketplace minimum input prices', () => {
  const items = parseA6MarketplaceItems({ data: { items: [{ model_name: 'kimi-k2.6', min_input_price_micros: 10080, listing_count: 3 }] } })
  assert.equal(items.length, 1)
  assert.equal(convertA6MarketplacePriceToVnd(items[0].minInputPriceMicros, 25_000), 252)
  assert.equal(findA6MarketplaceItem('kimi-k2.6', items)?.modelName, 'kimi-k2.6')
})

test('maps DeepSeek V4 to the first available A6 variant', () => {
  const items = parseA6MarketplaceItems({ data: { items: [
    { model_name: 'DeepSeek-V4-Flash-0731', min_input_price_micros: '6000' },
    { model_name: 'deepseek-v4-pro', min_input_price_micros: '19200' },
  ] } })
  assert.equal(findA6MarketplaceItem('deepseek-v4', items)?.modelName, 'DeepSeek-V4-Flash-0731')
})
