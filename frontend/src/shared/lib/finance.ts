export function getDeltaClass(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return ''
  }

  if (delta > 0) {
    return 'negative'
  }

  if (delta < 0) {
    return 'positive'
  }

  return ''
}

