import { createRoot } from 'react-dom/client';

import App from './App';
import { preloadStudioIntroAssets } from '@/lib/studio-intro';

import './index.css';

preloadStudioIntroAssets();

createRoot(document.getElementById('root')!).render(<App />);
