import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditProjectModal } from '../EditProjectModal'
import { useUpdateProjectMutation } from '@/shared/api/projectsApi'
import { useGetForemenQuery } from '@/shared/api/usersApi'
import type { Project } from '@/entities/project/model'

const mockUpdateProject = vi.fn()

vi.mock('@/shared/api/projectsApi', () => ({
  useUpdateProjectMutation: vi.fn(),
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

const minimalProject: Project = {
  id: 10,
  name: 'Existing Project',
  description: 'Old description',
  status: 'active',
  created_by: 1,
  created_by_username: 'admin',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('EditProjectModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(useUpdateProjectMutation).mockReturnValue([
      mockUpdateProject,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useUpdateProjectMutation>)
    vi.mocked(useGetForemenQuery).mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetForemenQuery>)
    mockUpdateProject.mockReset()
    onClose.mockClear()
  })

  it('submit success: calls updateProject with expected payload', async () => {
    mockUpdateProject.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(
      <EditProjectModal
        isOpen={true}
        onClose={onClose}
        project={minimalProject}
      />
    )

    const nameInput = screen.getAllByRole('textbox')[0]
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Updated Project Name')
    const textareas = screen.getAllByRole('textbox')
    const descriptionField = textareas.find((el) => el.getAttribute('rows') === '4')
    if (descriptionField) {
      await userEvent.clear(descriptionField)
      await userEvent.type(descriptionField, 'Updated description')
    }

    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(mockUpdateProject).toHaveBeenCalledTimes(1)
    expect(mockUpdateProject).toHaveBeenCalledWith({
      id: minimalProject.id,
      data: {
        name: 'Updated Project Name',
        description: 'Updated description',
        status: 'active',
      },
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submit error: shows error message', async () => {
    mockUpdateProject.mockReturnValue({
      unwrap: () => Promise.reject({ detail: 'Update failed' }),
    })

    render(
      <EditProjectModal
        isOpen={true}
        onClose={onClose}
        project={minimalProject}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(mockUpdateProject).toHaveBeenCalled()
    expect(screen.getByText('Update failed')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
