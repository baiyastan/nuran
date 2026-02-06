import { baseApi } from './baseApi'
import { Project } from '@/entities/project/model'

export interface ProjectListParams {
  status?: string
  created_by?: number
  search?: string
  ordering?: string
  page?: number
}

export interface ProjectListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Project[]
}

export interface CreateProjectRequest {
  name: string
  description?: string
  status?: 'active' | 'completed' | 'on_hold'
  prorab_id?: number
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
  status?: 'active' | 'completed' | 'on_hold'
  prorab_id?: number | null
}

export const projectsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listProjects: builder.query<ProjectListResponse, ProjectListParams | void>({
      query: (params) => ({
        url: '/projects/',
        params,
      }),
      providesTags: ['Projects'],
    }),
    getProject: builder.query<Project, number>({
      query: (id) => ({ url: `/projects/${id}/` }),
      providesTags: (result, error, id) => [{ type: 'Projects', id }],
    }),
    createProject: builder.mutation<Project, CreateProjectRequest>({
      query: (body) => ({
        url: '/projects/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Projects', 'ProrabProjects'],
    }),
    updateProject: builder.mutation<Project, { id: number; data: UpdateProjectRequest }>({
      query: ({ id, data }) => ({
        url: `/projects/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Projects', id },
        'Projects',
        'ProrabProjects',
      ],
    }),
    deleteProject: builder.mutation<void, number>({
      query: (id) => ({
        url: `/projects/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Projects', 'ProrabProjects'],
    }),
  }),
})

export const {
  useListProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} = projectsApi
