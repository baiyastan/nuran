import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateProjectModal } from '../CreateProjectModal'
import { useCreateProjectMutation } from '@/shared/api/projectsApi'
import { useGetForemenQuery } from '@/shared/api/usersApi'

const mockCreateProject = vi.fn()

vi.mock('@/shared/api/projectsApi', () => ({
  useCreateProjectMutation: vi.fn(),
}))

vi.mock('@/shared/api/usersApi', () => ({
  useGetForemenQuery: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

describe('CreateProjectModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(useCreateProjectMutation).mockReturnValue([
      mockCreateProject,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useCreateProjectMutation>)
    vi.mocked(useGetForemenQuery).mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetForemenQuery>)
    mockCreateProject.mockReset()
    onClose.mockClear()
  })

  it('submit success: calls createProject with expected payload', async () => {
    mockCreateProject.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(
      <CreateProjectModal isOpen={true} onClose={onClose} />
    )

    const textboxes = screen.getAllByRole('textbox')
    const nameInput = textboxes[0]
    await userEvent.type(nameInput, 'New Project')
    const descriptionField = textboxes.find((el) => el.getAttribute('rows') === '4') ?? textboxes[textboxes.length - 1]
    await userEvent.type(descriptionField, 'Project description')

    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(mockCreateProject).toHaveBeenCalledTimes(1)
    expect(mockCreateProject).toHaveBeenCalledWith({
      name: 'New Project',
      description: 'Project description',
      status: 'active',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submit error: shows error message', async () => {
    mockCreateProject.mockReturnValue({
      unwrap: () => Promise.reject({ detail: 'Name already exists' }),
    })

    render(
      <CreateProjectModal isOpen={true} onClose={onClose} />
    )

    const textboxes = screen.getAllByRole('textbox')
    const nameInput = textboxes[0]
    await userEvent.type(nameInput, 'Ab')
    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(mockCreateProject).toHaveBeenCalled()
    expect(screen.getByText('Name already exists')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
