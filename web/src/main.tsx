import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { ensureDemoSession } from '@/api/client';
import '@/index.css';

void ensureDemoSession();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root is missing');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
