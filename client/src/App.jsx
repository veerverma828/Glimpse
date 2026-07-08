import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import HostPage from './pages/HostPage';
import ViewerPage from './pages/ViewerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1e2230',
            color: '#eef0f5',
            border: '1px solid rgba(67, 75, 95, 0.5)',
            borderRadius: '12px',
            fontSize: '14px',
            backdropFilter: 'blur(12px)',
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#1e2230' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#1e2230' },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<HostPage />} />
        <Route path="/join/:roomId" element={<ViewerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
