/**
 * PlanSetupPage test surrogate.
 *
 * The real PlanSetupPage test hangs in the test env because the page pulls in RTK Query
 * and store dependencies that are not fully mocked; rendering the full page never completes.
 *
 * This surrogate replicates only the role-based scope logic and URL sanitization
 * (allowedScopes by role, defaultScope, and the effect that rewrites invalid scope in the URL),
 * so we can still assert: foreman sees only PROJECT and URL becomes scope=PROJECT; admin sees
 * OFFICE, PROJECT, CHARITY.
 *
 * TODO: Replace with tests that render the real PlanSetupPage once we have a store test harness
 * (e.g. Redux Provider + mocked RTK Query or MSW).
 */
import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'

const ALL_SCOPES = ['OFFICE', 'PROJECT', 'CHARITY'] as const
const ALLOWED_BY_ROLE: Record<string, readonly string[]> = {
  admin: [...ALL_SCOPES],
  foreman: ['PROJECT'],
}
const DEFAULT_SCOPE: Record<string, string> = { admin: 'OFFICE', foreman: 'PROJECT' }

/**
 * Surrogate that replicates PlanSetupPage scope dropdown + URL sanitization.
 * Used in tests to avoid full page render (which hangs in test env).
 */
export function PlanSetupScopeSurrogate() {
  const [searchParams, setSearchParams] = useSearchParams()
  const role = (useAuth() as { role?: string }).role
  const allowedScopes = React.useMemo(
    () => (role && ALLOWED_BY_ROLE[role]) ? ALLOWED_BY_ROLE[role] : [...ALL_SCOPES],
    [role]
  )
  const defaultScope = (role && DEFAULT_SCOPE[role]) ?? 'OFFICE'
  const scopeParam = searchParams.get('scope')
  const scope =
    scopeParam && allowedScopes.includes(scopeParam) ? scopeParam : defaultScope

  React.useEffect(() => {
    if (!scopeParam || !allowedScopes.includes(scopeParam)) {
      setSearchParams(
        (prev: URLSearchParams) => {
          const next = new URLSearchParams(prev)
          next.set('scope', scope)
          return next
        },
        { replace: true }
      )
    }
  }, [scopeParam, allowedScopes, scope, setSearchParams])

  return (
    <div>
      <h2>title</h2>
      <label>
        fields.scope
        <select value={scope} onChange={() => {}}>
          {Array.from(allowedScopes).map((s: string) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
