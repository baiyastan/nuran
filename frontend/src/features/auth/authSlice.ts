import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { User } from '@/entities/user/model'
import { authSetAccessToken, authLogout } from '@/shared/auth/authActions'
import { authApi } from '@/shared/api/authApi'

type MeStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

interface AuthState {
  accessToken: string | null
  user: User | null
  meStatus: MeStatus
}

// Load initial token from localStorage if available
const loadTokenFromStorage = (): string | null => {
  try {
    return localStorage.getItem('accessToken')
  } catch (error) {
    console.error('Failed to read accessToken from localStorage:', error)
    return null
  }
}

const initialState: AuthState = {
  accessToken: loadTokenFromStorage(), // Load from localStorage on app start
  user: null,
  meStatus: 'idle',
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ access: string; user: User }>
    ) => {
      state.accessToken = action.payload.access
      state.user = action.payload.user
      state.meStatus = 'succeeded'
      // Save to localStorage for persistence
      try {
        localStorage.setItem('accessToken', action.payload.access)
      } catch (error) {
        console.error('Failed to save accessToken to localStorage:', error)
      }
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload
      // Save to localStorage for persistence
      try {
        localStorage.setItem('accessToken', action.payload)
      } catch (error) {
        console.error('Failed to save accessToken to localStorage:', error)
      }
    },
    logout: (state) => {
      state.accessToken = null
      state.user = null
      // Clear from localStorage
      try {
        localStorage.removeItem('accessToken')
      } catch (error) {
        console.error('Failed to remove accessToken from localStorage:', error)
      }
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload
    },
  },
  extraReducers: (builder) => {
    // Handle shared auth actions (used by axiosBaseQuery to avoid circular dependencies)
    builder
      .addCase(authSetAccessToken, (state, action) => {
        state.accessToken = action.payload
        // Save to localStorage for persistence
        try {
          localStorage.setItem('accessToken', action.payload)
        } catch (error) {
          console.error('Failed to save accessToken to localStorage:', error)
        }
      })
      .addCase(authLogout, (state) => {
        state.accessToken = null
        state.user = null
        state.meStatus = 'idle'
        // Clear from localStorage
        try {
          localStorage.removeItem('accessToken')
        } catch (error) {
          console.error('Failed to remove accessToken from localStorage:', error)
        }
      })
      // Track /auth/me query status
      .addMatcher(authApi.endpoints.me.matchPending, (state) => {
        state.meStatus = 'loading'
      })
      .addMatcher(authApi.endpoints.me.matchFulfilled, (state, action) => {
        state.meStatus = 'succeeded'
        state.user = action.payload
      })
      .addMatcher(authApi.endpoints.me.matchRejected, (state) => {
        state.meStatus = 'failed'
      })
  },
})

export const { setCredentials, setAccessToken, logout, setUser } = authSlice.actions

export const selectAccessToken = (state: { auth: AuthState }) => state.auth.accessToken
export const selectUser = (state: { auth: AuthState }) => state.auth.user
export const selectRole = (state: { auth: AuthState }) => state.auth.user?.role
export const selectMeStatus = (state: { auth: AuthState }) => state.auth.meStatus

export default authSlice.reducer
