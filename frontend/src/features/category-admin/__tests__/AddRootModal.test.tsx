import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddRootModal } from '../AddRootModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

describe('AddRootModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onSuccess.mockClear()
  })

  it('shows system-defined root message', async () => {
    render(
      <AddRootModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    )
    expect(
      screen.getByText('Root categories are system-defined and cannot be created manually.')
    ).toBeInTheDocument()
  })
})
