import { createBrowserRouter } from 'react-router';
import { AppShell, RequireAuth } from './components/app-shell';
import { LoginPage } from './pages/login';
import { HomePage } from './pages/home';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          // Loaded on first visit to keep the initial download to what Home needs.
          { path: '/history', lazy: () => import('./pages/history').then((m) => ({ Component: m.HistoryPage })) },
          { path: '/items/:id', lazy: () => import('./pages/item').then((m) => ({ Component: m.ItemPage })) },
        ],
      },
    ],
  },
]);
