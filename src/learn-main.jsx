import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import LearnApp from '../learn-app.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LearnApp />
  </StrictMode>
);
