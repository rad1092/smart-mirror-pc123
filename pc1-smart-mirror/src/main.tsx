import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import './styles/global.css';

import ProfileSelectPage from './pages/ProfileSelectPage';
import BaselineCheckPage from './pages/BaselineCheckPage';
import BaselineSetupPage from './pages/BaselineSetupPage';
import ModePage from './pages/ModePage';
import CameraPage from './pages/CameraPage';
import ResultPage from './pages/ResultPage';
import WindowControls from './components/WindowControls';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <AppProvider>
    <BrowserRouter>
      <WindowControls />
      <Routes>
        <Route path="/" element={<ProfileSelectPage />} />
        <Route path="/baseline-check" element={<BaselineCheckPage />} />
        <Route path="/baseline-setup" element={<BaselineSetupPage />} />
        <Route path="/mode" element={<ModePage />} />
        <Route path="/camera" element={<CameraPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AppProvider>,
);
