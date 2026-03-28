/**
 * Normalize RTK Query / Axios-style API errors into stable shapes for UI.
 * Does not change backend contracts — parses documented message formats.
 */

const INSUFFICIENT_BALANCE_RE =
  /^Insufficient balance on (.+?)\.\s*Available:\s*([\d.]+)\s*\.?\s*$/i

/** Backend uses ACCOUNT_CHOICES labels: "Cash", "Bank" (English). */
function accountLabelToCode(label: string): 'CASH' | 'BANK' | null {
  const n = label.trim().toLowerCase()
  if (n === 'cash' || n === 'cash.') return 'CASH'
  if (n === 'bank' || n === 'bank.') return 'BANK'
  return null
}

export type ParsedInsufficientBalance = {
  account: 'CASH' | 'BANK'
  /** Numeric available balance from backend string */
  available: number
  rawMessage: string
}

/**
 * Parse backend expense balance error: "Insufficient balance on Cash. Available: 22000.00."
 */
export function parseInsufficientBalanceMessage(message: string): ParsedInsufficientBalance | null {
  const m = message.trim().match(INSUFFICIENT_BALANCE_RE)
  if (!m) return null
  const labelPart = m[1].trim()
  const availableStr = m[2].trim()
  const account = accountLabelToCode(labelPart)
  if (!account) return null
  const available = Number.parseFloat(availableStr)
  if (Number.isNaN(available)) return null
  return { account, available, rawMessage: message.trim() }
}

/** HTTP status when known from the transport layer (optional on all kinds). */
type WithOptionalHttpStatus = { status?: number }

export type NormalizedApiError =
  | ({
      kind: 'insufficient_balance'
      account: 'CASH' | 'BANK'
      available: number
      /** Original backend line (e.g. under amount field in DRF) */
      sourceMessage: string
    } & WithOptionalHttpStatus)
  | ({
      kind: 'validation'
      /** First message per field */
      fields: Record<string, string>
      /** Human-readable summary for alert */
      summary: string
    } & WithOptionalHttpStatus)
  | ({ kind: 'message'; message: string } & WithOptionalHttpStatus)
  /** 400 (or inferred 400) with no safe body — avoid raw Axios status-line text */
  | { kind: 'bad_request'; status?: number }
  | ({ kind: 'generic'; message: string } & WithOptionalHttpStatus)

function firstStringFromFieldValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && value.length > 0) {
    const s = value[0]
    if (typeof s === 'string' && s.trim()) return s.trim()
  }
  return null
}

function flattenDrfErrors(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(data)) {
    const msg = firstStringFromFieldValue(val)
    if (msg) out[key] = msg
  }
  return out
}

function parseHttpStatus(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && /^\d{3}$/.test(v)) return parseInt(v, 10)
  return undefined
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function inferStatusFromMessages(messages: string[]): number | undefined {
  const joined = messages.join(' ')
  if (/status code 400/i.test(joined)) return 400
  return undefined
}

/** True when the string is empty or a typical Axios / fetch status-line (no app semantics). */
function isTransportOnlyStatusMessage(msg: string): boolean {
  const t = msg.trim()
  if (!t) return true
  return /request failed with status code \d{3}/i.test(t)
}

function pickBestDrfDataObject(candidates: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const withAmount = candidates.find((o) => 'amount' in o)
  if (withAmount) return withAmount
  const withFields = candidates.find((o) => Object.keys(flattenDrfErrors(o)).length > 0)
  return withFields
}

/** Keys common on RTK/Axios error wrappers — not DRF field payloads */
const TRANSPORT_KEYS = new Set([
  'status',
  'data',
  'error',
  'message',
  'response',
  'payload',
  'config',
  'code',
  'name',
  'stack',
  'isAxiosError',
  'request',
  'meta',
])

function residualObjectForDrfRootCheck(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (!TRANSPORT_KEYS.has(k)) out[k] = v
  }
  return out
}

/**
 * Unwrap RTK Query / axiosBaseQuery / AxiosError / nested wrappers into { status, data, error }.
 * Walks err, err.error, err.payload, err.data, err.response.data, err.meta, and nested combinations.
 */
export function coerceQueryErrorPayload(err: unknown): {
  status?: number
  data?: unknown
  error?: string
} {
  if (!isPlainObject(err)) {
    return {}
  }

  const statusValues: number[] = []
  const recordStatus = (v: unknown) => {
    const s = parseHttpStatus(v)
    if (s != null) statusValues.push(s)
  }

  const errorStrings: string[] = []
  const recordErrorString = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) errorStrings.push(v.trim())
  }

  const dataObjectCandidates: Record<string, unknown>[] = []
  const seenData = new Set<Record<string, unknown>>()
  const recordDataObject = (v: unknown) => {
    if (!isPlainObject(v) || seenData.has(v)) return
    seenData.add(v)
    dataObjectCandidates.push(v)
  }

  const stringBodyCandidates: string[] = []

  const visit = (node: unknown, depth: number) => {
    if (depth > 10 || !isPlainObject(node)) return
    const o = node as Record<string, unknown>

    recordStatus(o.status)
    recordErrorString(o.error)
    recordErrorString(o.message)

    if (isPlainObject(o.data)) {
      recordDataObject(o.data)
    }

    if (isPlainObject(o.response)) {
      const res = o.response as Record<string, unknown>
      recordStatus(res.status)
      if (isPlainObject(res.data)) {
        recordDataObject(res.data)
      } else if (typeof res.data === 'string' && res.data.trim()) {
        stringBodyCandidates.push(res.data.trim())
      }
    }

    if (o.error != null) visit(o.error, depth + 1)
    if (o.payload != null) visit(o.payload, depth + 1)
    if (o.meta != null) visit(o.meta, depth + 1)
  }

  visit(err, 0)

  // Root may be the DRF payload itself (e.g. only { amount: [...] } passed through)
  const residualRoot = residualObjectForDrfRootCheck(err)
  if ('amount' in err || Object.keys(flattenDrfErrors(residualRoot)).length > 0) {
    recordDataObject(err)
  }

  let status = statusValues.find((s) => s === 400) ?? statusValues[0]
  const inferred = inferStatusFromMessages(errorStrings)
  if (status == null && inferred != null) status = inferred

  const dataObj = pickBestDrfDataObject(dataObjectCandidates)
  let data: unknown = dataObj

  if (data == null && stringBodyCandidates.length > 0) {
    data = stringBodyCandidates[0]
  }

  if (data == null) {
    let n: unknown = err
    let depth = 0
    while (depth <= 10 && isPlainObject(n)) {
      const r = (n as Record<string, unknown>).response
      if (isPlainObject(r)) {
        const rd = (r as Record<string, unknown>).data
        if (typeof rd === 'string' && rd.trim()) {
          data = rd.trim()
          break
        }
      }
      n = (n as Record<string, unknown>).error
      depth += 1
    }
  }

  const error = errorStrings[0]

  return {
    status,
    data,
    error,
  }
}

/**
 * Extract RTK Query mutation error payload (axiosBaseQuery shape: { status, data, error }).
 */
export function normalizeApiMutationError(err: unknown): NormalizedApiError {
  if (err == null) {
    return { kind: 'generic', message: '' }
  }

  const { status, data, error: transportError } = coerceQueryErrorPayload(err)
  const errStr = typeof transportError === 'string' ? transportError.trim() : ''
  const effectiveStatus = status ?? inferStatusFromMessages([errStr])

  const withStatus = <T extends Record<string, unknown>>(base: T): T & { status?: number } =>
    effectiveStatus != null ? { ...base, status: effectiveStatus } : base

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const dataObj = data as Record<string, unknown>

    const amountMsg = firstStringFromFieldValue(dataObj.amount)
    if (amountMsg) {
      const parsed = parseInsufficientBalanceMessage(amountMsg)
      if (parsed) {
        return withStatus({
          kind: 'insufficient_balance',
          account: parsed.account,
          available: parsed.available,
          sourceMessage: amountMsg,
        }) as NormalizedApiError
      }
    }

    const detail = firstStringFromFieldValue(dataObj.detail)
    if (detail && Object.keys(dataObj).length <= 2) {
      return withStatus({ kind: 'message', message: detail }) as NormalizedApiError
    }

    const fields = flattenDrfErrors(dataObj)
    if (Object.keys(fields).length > 0) {
      const parts = Object.entries(fields).map(([k, v]) => `${k}: ${v}`)
      return withStatus({
        kind: 'validation',
        fields,
        summary: parts.join(' · '),
      }) as NormalizedApiError
    }
  }

  if (typeof data === 'string' && data.trim()) {
    return withStatus({ kind: 'message', message: data.trim() }) as NormalizedApiError
  }

  if (effectiveStatus === 400 && isTransportOnlyStatusMessage(errStr)) {
    return { kind: 'bad_request', status: effectiveStatus }
  }

  if (errStr && !isTransportOnlyStatusMessage(errStr)) {
    return withStatus({ kind: 'generic', message: errStr }) as NormalizedApiError
  }

  if (isTransportOnlyStatusMessage(errStr) && effectiveStatus != null) {
    return {
      kind: 'generic',
      message: `Request failed (${effectiveStatus})`,
      status: effectiveStatus,
    }
  }

  return {
    kind: 'generic',
    message: effectiveStatus != null ? `Request failed (${effectiveStatus})` : 'Request failed',
    ...(effectiveStatus != null ? { status: effectiveStatus } : {}),
  }
}
