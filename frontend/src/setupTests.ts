import '@testing-library/jest-dom'

const originalWarn = console.warn
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : String(args[0])
  if (msg.includes('React Router Future Flag Warning')) return
  originalWarn.apply(console, args)
}
