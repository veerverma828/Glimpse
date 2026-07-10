import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import UpdateChecker from './components/UpdateChecker'
import HostPage from './pages/HostPage'
import ViewerPage from './pages/ViewerPage'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#17151f',
            color: '#f4f2fa',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px',
          },
        }}
      />
      <Layout>
        <Routes>
          <Route path="/" element={<HostPage />} />
          <Route path="/join/:roomId" element={<ViewerPage />} />
        </Routes>
      </Layout>
      <UpdateChecker />
    </BrowserRouter>
  )
}

export default App
