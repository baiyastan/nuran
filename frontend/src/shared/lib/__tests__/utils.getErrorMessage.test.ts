import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../utils'

describe('getErrorMessage', () => {
  it('error is string -> returns it', () => {
    expect(getErrorMessage('Something went wrong')).toBe('Something went wrong')
    expect(getErrorMessage('')).toBe('')
  })

  it('error is object with { data: { detail: "x" } } -> "x"', () => {
    expect(getErrorMessage({ data: { detail: 'x' } })).toBe('x')
    expect(getErrorMessage({ data: { detail: 'Server error' } })).toBe('Server error')
  })

  it('error is object with { data: { message: "x" } } -> "x"', () => {
    expect(getErrorMessage({ data: { message: 'x' } })).toBe('x')
    expect(getErrorMessage({ data: { message: 'Validation failed' } })).toBe('Validation failed')
  })

  it('error is object with { data: { error: "x" } } -> "x"', () => {
    expect(getErrorMessage({ data: { error: 'x' } })).toBe('x')
    expect(getErrorMessage({ data: { error: 'Bad request' } })).toBe('Bad request')
  })

  it('error is object with { error: "x" } -> "x"', () => {
    expect(getErrorMessage({ error: 'x' })).toBe('x')
    expect(getErrorMessage({ error: 'Forbidden' })).toBe('Forbidden')
  })

  it('unknown/empty object -> returns string (JSON or fallback)', () => {
    // Empty object: stringified is "[object Object]", then JSON.stringify gives "{}"
    expect(getErrorMessage({})).toBe('{}')
    // Unknown object with no known keys falls back to string conversion
    expect(getErrorMessage({ foo: 1 })).toBe('{"foo":1}')
  })
})
