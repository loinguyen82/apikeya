import assert from 'node:assert/strict'
import test from 'node:test'
import { generateApiKey, sha256Hex } from '../src/lib/api-keys.ts'

test('generates server credentials with the APIVN prefix and display metadata', () => {
  const first = generateApiKey()
  const second = generateApiKey()

  assert.match(first.plaintext, /^sk-apivn-[A-Za-z0-9_-]{32}$/)
  assert.equal(first.prefix, 'sk-apivn')
  assert.equal(first.lastFour, first.plaintext.slice(-4))
  assert.notEqual(first.plaintext, second.plaintext)
})

test('hashes API keys without retaining plaintext', async () => {
  const { plaintext } = generateApiKey()
  const hash = await sha256Hex(plaintext)

  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.notEqual(hash, plaintext)
  assert.equal(hash.includes(plaintext), false)
})
