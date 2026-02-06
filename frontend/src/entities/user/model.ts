export interface User {
  id: number
  email: string
  role: 'admin' | 'director' | 'foreman'
  is_active?: boolean
  date_joined?: string
}
