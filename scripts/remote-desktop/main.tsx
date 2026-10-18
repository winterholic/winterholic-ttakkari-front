// Local-only integration fixture. Not a production entry point or authentication path.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAccessToken } from '../../src/api/client';
import { RemoteDesktopPage } from '../../src/pages/RemoteDesktopPage';
import '../../src/vendor/ttakkari/tokens.css';
import '../../src/vendor/ttakkari/typography.css';
import '../../src/vendor/ttakkari/components.css';
setAccessToken('fixture-owner');
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RemoteDesktopPage /></QueryClientProvider></StrictMode>);
