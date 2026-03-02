import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '../utils'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fn once after delay when called multiple times quickly', () => {
    const fn = vi.fn()
    const wait = 100
    const debounced = debounce(fn, wait)

    debounced('a')
    debounced('b')
    debounced('c')

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(wait)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })
})
