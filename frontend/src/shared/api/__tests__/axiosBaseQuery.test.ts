import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { axiosBaseQuery } from '../axiosBaseQuery'
import { axiosInstance } from '../axiosInstance'

vi.mock('axios', () => ({
  __esModule: true,
  default: {
    isAxiosError: vi.fn(),
  },
}))

vi.mock('../axiosInstance', () => ({
  axiosInstance: vi.fn(),
}))

function createAxiosErrorLike(overrides: { status?: number; data?: unknown; message?: string } = {}) {
  const status = overrides.status ?? 401
  const message = overrides.message ?? 'Request failed'
  return {
    isAxiosError: true,
    response: {
      status,
      data: overrides.data ?? { detail: message },
    },
    message,
    config: {},
    name: 'AxiosError',
  }
}

describe('axiosBaseQuery', () => {
  const baseQuery = axiosBaseQuery()
  const getState = vi.fn(() => ({ auth: { accessToken: 'old-token' } }))
  const dispatch = vi.fn()
  const api = { getState, dispatch }

  beforeEach(() => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false)
    vi.mocked(axiosInstance).mockReset()
    getState.mockReturnValue({ auth: { accessToken: 'old-token' } })
    dispatch.mockClear()
  })

  describe('401 then refresh success then retry success', () => {
    it('returns data after refresh and retry', async () => {
      const axiosErrorLike = createAxiosErrorLike({ status: 401 })
      vi.mocked(axios.isAxiosError).mockReturnValue(true)

      vi.mocked(axiosInstance)
        .mockRejectedValueOnce(axiosErrorLike)
        .mockResolvedValueOnce({ data: { access: 'new-token' } })
        .mockResolvedValueOnce({ data: { id: 1, name: 'Project' } })

      const result = await baseQuery(
        { url: '/projects/' },
        api as never,
        {} as never
      )

      expect(result).toEqual({ data: { id: 1, name: 'Project' } })
      expect(axiosInstance).toHaveBeenCalledTimes(3)
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'auth/setAccessToken', payload: 'new-token' })
      )
    })
  })

  describe('401 then refresh fails', () => {
    it('returns error and processes queue (no hanging)', async () => {
      const axiosErrorLike = createAxiosErrorLike({ status: 401 })
      vi.mocked(axios.isAxiosError).mockReturnValue(true)

      vi.mocked(axiosInstance)
        .mockRejectedValueOnce(axiosErrorLike)
        .mockRejectedValueOnce(createAxiosErrorLike({ status: 401, message: 'Refresh failed' }))

      const result = await baseQuery(
        { url: '/projects/' },
        api as never,
        {} as never
      )

      expect(result).toHaveProperty('error')
      expect((result as { error: { status?: number } }).error.status).toBe(401)
      expect((result as { error: { error?: string } }).error.error).toBe(
        'Authentication failed - refresh token expired'
      )
      expect(axiosInstance).toHaveBeenCalledTimes(2)
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/logout' }))
    })
  })

  describe('Non-axios thrown error', () => {
    it('returns error with status 500 and Unknown error', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(false)
      vi.mocked(axiosInstance).mockRejectedValueOnce(new Error('Network failed'))

      const result = await baseQuery(
        { url: '/projects/' },
        api as never,
        {} as never
      )

      expect(result).toEqual({
        error: {
          status: 500,
          data: expect.any(Error),
          error: 'Unknown error',
        },
      })
    })
  })
})
