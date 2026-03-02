import { Suspense } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from './store'
import { router } from './router'
import { ToastProvider } from '@/shared/ui/Toast/ToastProvider'
import Loader from '@/shared/ui/Loader/Loader'
import './App.css'

function App() {
  return (
    <Provider store={store}>
      <ToastProvider>
        <Suspense fallback={<Loader />}>
          <RouterProvider router={router} />
        </Suspense>
      </ToastProvider>
    </Provider>
  )
}

export default App
