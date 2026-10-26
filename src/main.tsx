import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProvedorDados } from './state/dados';
import './estilo.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorDados>
      <App />
    </ProvedorDados>
  </StrictMode>,
);
