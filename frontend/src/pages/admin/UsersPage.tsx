import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useGetUsersQuery, useUpdateUserRoleMutation } from '@/shared/api/usersApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { UserRoleEditor } from '@/features/user-management/UserRoleEditor'
import { formatDate } from '@/shared/lib/utils'
import './UsersPage.css'

function UsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useGetUsersQuery()
  const [updateUserRole] = useUpdateUserRoleMutation()

  const handleRoleUpdate = async (userId: number, role: 'admin' | 'director' | 'foreman') => {
    await updateUserRole({ userId, role }).unwrap()
    refetch() // Refresh the list
  }

  // Extract error status code
  const errorStatus = (error as any)?.status

  // Render error state
  if (error) {
    if (errorStatus === 401) {
      return (
        <div className="users-page">
          <div className="error">
            <p>{t('users.error401')}</p>
            <Button onClick={() => navigate('/login')}>
              {t('auth.signIn')}
            </Button>
          </div>
        </div>
      )
    }
    
    if (errorStatus === 403) {
      return (
        <div className="users-page">
          <div className="error">
            <p>{t('users.error403')}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="users-page">
        <div className="error">
          <p>{t('users.error')}</p>
          {import.meta.env.DEV && errorStatus && (
            <p style={{ fontSize: '12px', color: '#666' }}>
              Status: {errorStatus}
            </p>
          )}
        </div>
      </div>
    )
  }

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'email', label: t('users.email') },
    { key: 'role', label: t('users.role') },
    { key: 'status', label: t('users.status') },
    { key: 'date_joined', label: t('users.dateJoined') },
    { key: 'actions', label: t('users.actions') },
  ]

  const tableData = data?.results.map((user) => ({
    ...user,
    role: t(`users.roles.${user.role}`),
    status: user.is_active 
      ? <span style={{ color: '#198754' }}>{t('users.statusActive')}</span>
      : <span style={{ color: '#dc3545' }}>{t('users.statusInactive')}</span>,
    date_joined: user.date_joined ? formatDate(user.date_joined) : '-',
    actions: (
      <UserRoleEditor
        userId={user.id}
        currentRole={user.role}
        onSave={handleRoleUpdate}
      />
    ),
  })) || []

  return (
    <div className="users-page">
      <div className="page-header">
        <h2>{t('users.title')}</h2>
      </div>
      
      {isLoading ? (
        <div className="loading">{t('users.loading')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('users.noUsers')}</p>
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

export default UsersPage

