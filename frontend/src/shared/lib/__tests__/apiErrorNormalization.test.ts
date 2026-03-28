import { describe, it, expect } from 'vitest'
import {
  coerceQueryErrorPayload,
  normalizeApiMutationError,
  parseInsufficientBalanceMessage,
} from '../apiErrorNormalization'

describe('parseInsufficientBalanceMessage', () => {
  it('parses Cash with trailing period on available', () => {
    const r = parseInsufficientBalanceMessage(
      'Insufficient balance on Cash. Available: 22000.00.'
    )
    expect(r).toEqual({
      account: 'CASH',
      available: 22000,
      rawMessage: 'Insufficient balance on Cash. Available: 22000.00.',
    })
  })

  it('parses Bank', () => {
    const r = parseInsufficientBalanceMessage('Insufficient balance on Bank. Available: 1500.50.')
    expect(r).toEqual({
      account: 'BANK',
      available: 1500.5,
      rawMessage: 'Insufficient balance on Bank. Available: 1500.50.',
    })
  })

  it('returns null for unrelated message', () => {
    expect(parseInsufficientBalanceMessage('Amount must be greater than zero.')).toBeNull()
  })
})

describe('normalizeApiMutationError', () => {
  it('detects insufficient balance from DRF amount array (RTK shape)', () => {
    const err = {
      status: 400,
      data: { amount: ['Insufficient balance on Cash. Available: 22000.00.'] },
      error: 'Request failed with status code 400',
    }
    expect(normalizeApiMutationError(err)).toEqual({
      kind: 'insufficient_balance',
      account: 'CASH',
      available: 22000,
      sourceMessage: 'Insufficient balance on Cash. Available: 22000.00.',
      status: 400,
    })
  })

  it('detects insufficient balance on Bank', () => {
    const err = {
      status: 400,
      data: { amount: ['Insufficient balance on Bank. Available: 100.00.'] },
      error: 'Request failed with status code 400',
    }
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'insufficient_balance',
      account: 'BANK',
      available: 100,
      status: 400,
    })
  })

  it('maps bare 400 without useful body to bad_request (no raw Axios line)', () => {
    const err = {
      status: 400,
      data: {},
      error: 'Request failed with status code 400',
    }
    const n = normalizeApiMutationError(err)
    expect(n).toEqual({ kind: 'bad_request', status: 400 })
  })

  it('unwraps nested RTK error.error payload', () => {
    const err = {
      error: {
        status: 400,
        data: { amount: ['Insufficient balance on Cash. Available: 99.00.'] },
        error: 'Request failed with status code 400',
      },
    }
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'insufficient_balance',
      account: 'CASH',
      available: 99,
      status: 400,
    })
  })

  it('coerceQueryErrorPayload reads Axios-like response', () => {
    const err = {
      name: 'AxiosError',
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: { amount: ['Insufficient balance on Bank. Available: 10.00.'] },
      },
    }
    const c = coerceQueryErrorPayload(err)
    expect(c.status).toBe(400)
    expect(c.data).toEqual({ amount: ['Insufficient balance on Bank. Available: 10.00.'] })
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'insufficient_balance',
      account: 'BANK',
      available: 10,
      status: 400,
    })
  })

  it('validation: multiple fields summary', () => {
    const err = {
      status: 400,
      data: { scope: ['Invalid'], comment: ['Required'] },
      error: 'Request failed with status code 400',
    }
    const n = normalizeApiMutationError(err)
    expect(n.kind).toBe('validation')
    if (n.kind === 'validation') {
      expect(n.fields.scope).toBe('Invalid')
      expect(n.fields.comment).toBe('Required')
      expect(n.summary).toContain('scope:')
      expect(n.status).toBe(400)
    }
  })

  it('insufficient_balance when status is missing but error message implies 400', () => {
    const err = {
      data: { amount: ['Insufficient balance on Cash. Available: 21000.00.'] },
      error: 'Request failed with status code 400',
    }
    const c = coerceQueryErrorPayload(err)
    expect(c.status).toBe(400)
    expect(normalizeApiMutationError(err)).toEqual({
      kind: 'insufficient_balance',
      account: 'CASH',
      available: 21000,
      sourceMessage: 'Insufficient balance on Cash. Available: 21000.00.',
      status: 400,
    })
  })

  it('bad_request when status inferred from message and body is empty', () => {
    const err = {
      data: {},
      error: 'Request failed with status code 400',
    }
    expect(normalizeApiMutationError(err)).toEqual({ kind: 'bad_request', status: 400 })
  })

  it('insufficient_balance from payload-shaped rejection', () => {
    const err = {
      payload: {
        data: { amount: ['Insufficient balance on Cash. Available: 1.00.'] },
        status: 400,
      },
    }
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'insufficient_balance',
      status: 400,
    })
  })

  it('insufficient_balance from deeply nested error.error.data', () => {
    const err = {
      error: {
        error: {
          data: { amount: ['Insufficient balance on Bank. Available: 50.00.'] },
        },
      },
    }
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'insufficient_balance',
      account: 'BANK',
      available: 50,
    })
  })

  it('coerce reads status and data from nested error object', () => {
    const err = {
      error: { status: 400, data: { amount: ['Insufficient balance on Cash. Available: 3.00.'] } },
    }
    const c = coerceQueryErrorPayload(err)
    expect(c.status).toBe(400)
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'insufficient_balance',
      status: 400,
    })
  })

  it('coerce preserves nested response.data when it is a string body', () => {
    const err = {
      error: {
        response: {
          status: 400,
          data: 'Plain-text error body',
        },
      },
    }
    expect(coerceQueryErrorPayload(err).data).toBe('Plain-text error body')
    expect(normalizeApiMutationError(err)).toMatchObject({
      kind: 'message',
      message: 'Plain-text error body',
      status: 400,
    })
  })

  it('non-400 transport-only message does not leak raw Axios line', () => {
    const err = {
      status: 502,
      error: 'Request failed with status code 502',
    }
    const n = normalizeApiMutationError(err)
    expect(n).toEqual({
      kind: 'generic',
      message: 'Request failed (502)',
      status: 502,
    })
  })

  it('400 with a non-transport error string stays generic with that message', () => {
    const err = {
      status: 400,
      data: {},
      error: 'Custom application error text',
    }
    expect(normalizeApiMutationError(err)).toEqual({
      kind: 'generic',
      message: 'Custom application error text',
      status: 400,
    })
  })
})
