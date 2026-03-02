import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import authReducer from '@/features/auth/authSlice'
import { baseApi } from '@/shared/api/baseApi'
import type { RootState } from '@/app/store'

interface AuthStateSlice {
  meStatus?: 'idle' | 'loading' | 'succeeded' | 'failed'
  accessToken?: string | null
  user?: { id: number; email: string; role: 'admin' | 'director' | 'foreman' } | null
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[]
  preloadedState?: Partial<RootState> & { auth?: AuthStateSlice }
}

/**
 * Creates a store with optional preloaded state for tests.
 * Use when the component under test uses useAppSelector (e.g. RequireRole uses selectMeStatus).
 * Typed by inference only; preloadedState accepted as object to avoid undefined incompatibility.
 */
export function createTestStore(preloadedState?: object) {
  return configureStore({
    reducer: {
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
    ...(preloadedState && { preloadedState }),
  })
}

/**
 * Renders a component with Redux Provider and MemoryRouter.
 * Use for components that need both store and routing (e.g. RequireRole with Outlet).
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    preloadedState,
    ...renderOptions
  }: RenderWithProvidersOptions = {}
) {
  const store = createTestStore(preloadedState)

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </Provider>
    )
  }

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  }
}
