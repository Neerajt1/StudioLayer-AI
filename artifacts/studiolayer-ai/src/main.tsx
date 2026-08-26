import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { preloadStudioIntroAssets } from '@/lib/studio-intro';
import { preloadStudioWelcomeAssets } from '@/lib/studio-welcome';

import './index.css';

setBaseUrl(import.meta.env.VITE_API_URL ?? null);

preloadStudioIntroAssets();
preloadStudioWelcomeAssets();

createRoot(document.getElementById('root')!).render(<App />);
