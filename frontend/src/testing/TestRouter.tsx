import { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'

/**
 * Renders current location.search for tests to assert URL changes (e.g. after sanitization).
 */
export function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location-display">{location.search || '?'}</div>
}

interface TestRouterProps {
  children: ReactNode
  initialEntries?: string[]
}

/**
 * Wraps children in MemoryRouter and renders LocationDisplay so tests can read location.search.
 */
export function TestRouter({ children, initialEntries = ['/'] }: TestRouterProps) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      {children}
      <LocationDisplay />
    </MemoryRouter>
  )
}
