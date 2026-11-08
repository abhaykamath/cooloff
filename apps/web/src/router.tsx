import { createBrowserRouter } from 'react-router';
import { AppShell, RequireAuth } from './components/app-shell';
import { LoginPage } from './pages/login';
import { HomePage } from './pages/home';
import { HistoryPage } from './pages/history';
import { ItemPage } from './pages/item';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/items/:id', element: <ItemPage /> },
        ],
      },
    ],
  },
]);
