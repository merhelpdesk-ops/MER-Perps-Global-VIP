import { ed25519 } from '@noble/curves/ed25519'
import bs58 from 'bs58'

export type Environment = 'mainnet' | 'testnet'
export interface Credentials { accountId: string; privateKey: string; environment: Environment }
export interface FeeRate { maker_fee_rate: number; taker_fee_rate: number; rwa_maker_fee_rate?: number; rwa_taker_fee_rate?: number }
export interface Trader { account_id: string; address: string; perp_volume: number; maker_fee_rate?: number; taker_fee_rate?: number; rwa_maker_fee_rate?: number; rwa_taker_fee_rate?: number; is_default_fee_rate?: boolean | string }
export interface PageMeta { total: number; records_per_page: number; current_page: number }
export interface PageResult<T> { rows: T[]; meta: PageMeta }
export interface PublicAccount { address: string; broker_id: string }

const base = (env: Environment) => env === 'mainnet' ? 'https://api.orderly.org' : 'https://testnet-api.orderly.org'

function privateKeyBytes(value: string) {
  const clean = value.trim().replace(/^0x/, '')
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return Uint8Array.from(clean.match(/.{2}/g)!.map(x => parseInt(x, 16)))
  try {
    const bytes = bs58.decode(value.trim())
    if (bytes.length === 32) return bytes
  } catch { /* show normalized error below */ }
  throw new Error('Private Key 必须是 32-byte hex 或 base58')
}

export async function signedRequest<T>(credentials: Credentials, path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase()
  const timestamp = Date.now().toString()
  const body = typeof init.body === 'string' ? init.body : ''
  const key = privateKeyBytes(credentials.privateKey)
  const signature = ed25519.sign(new TextEncoder().encode(`${timestamp}${method}${path}${body}`), key)
  const result = await fetch(`${base(credentials.environment)}${path}`, {
    ...init,
    headers: {
      'Content-Type': method === 'GET' || method === 'DELETE' ? 'application/x-www-form-urlencoded' : 'application/json',
      'orderly-timestamp': timestamp,
      'orderly-account-id': credentials.accountId.trim(),
      'orderly-key': `ed25519:${bs58.encode(ed25519.getPublicKey(key))}`,
      'orderly-signature': bytesToBase64Url(signature),
      ...init.headers,
    },
  })
  let payload: any
  try { payload = await result.json() } catch { throw new Error(`Orderly API 返回了无效响应（HTTP ${result.status}）`) }
  if (!result.ok || !payload.success) throw new Error(payload.message || `Orderly API 请求失败（HTTP ${result.status}）`)
  return payload.data as T
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const getDefaultFee = (c: Credentials) => signedRequest<FeeRate>(c, '/v1/broker/fee_rate/default')

export async function getPublicAccount(environment: Environment, accountId: string) {
  const query = new URLSearchParams({ account_id: accountId.trim() })
  const response = await fetch(`${base(environment)}/v1/public/account?${query}`)
  let payload: any
  try { payload = await response.json() } catch { throw new Error(`账户信息接口返回了无效响应（HTTP ${response.status}）`) }
  if (!response.ok || !payload.success) throw new Error(payload.message || `无法获取账户对应的 Broker ID（HTTP ${response.status}）`)
  if (!payload.data?.broker_id) throw new Error('该 Account ID 没有返回 Broker ID')
  return payload.data as PublicAccount
}

export async function getVolumePage(c: Credentials, brokerId: string, start: string, end: string, page: number, size: number) {
  const query = new URLSearchParams({ start_date: start, end_date: end, page: String(page), size: String(size), broker_id: brokerId, sort: 'descending_perp_volume', aggregateBy: 'address' })
  return signedRequest<PageResult<Trader> & { snapshot_time?: number }>(c, `/v1/broker/leaderboard/daily?${query}`)
}

export async function getUserFee(c: Credentials, accountId: string) {
  const q = new URLSearchParams({ account_id: accountId })
  const data = await signedRequest<{ rows?: Trader[] } | Trader>(c, `/v1/broker/user_info?${q}`)
  if ('rows' in data) return data.rows?.[0]
  return data as Trader
}

export async function getUserFeePage(c: Credentials, page: number, size: number, needsCustomOnly = false) {
  const q = new URLSearchParams({ page: String(page), size: String(size) })
  if (needsCustomOnly) q.set('is_default_fee_rate', 'false')
  return signedRequest<PageResult<Trader>>(c, `/v1/broker/user_info?${q}`)
}

export async function setFee(c: Credentials, accountIds: string[], fee: FeeRate) {
  const rate = (value: number) => Math.round(value * 1_000_000) / 1_000_000
  const body = JSON.stringify({ maker_fee_rate: rate(fee.maker_fee_rate), taker_fee_rate: rate(fee.taker_fee_rate), account_ids: accountIds, ...(fee.rwa_maker_fee_rate == null ? {} : { rwa_maker_fee_rate: rate(fee.rwa_maker_fee_rate) }), ...(fee.rwa_taker_fee_rate == null ? {} : { rwa_taker_fee_rate: rate(fee.rwa_taker_fee_rate) }) })
  return signedRequest(c, '/v1/broker/fee_rate/set', { method: 'POST', body })
}
