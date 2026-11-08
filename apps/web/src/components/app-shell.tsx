import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLogout, useMe } from '@/lib/queries';
import { Button } from '@/components/ui/button';

export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return null;
  if (me.isError) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  );

export function AppShell() {
  const logout = useLogout();
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          Cooloff
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLink}>
            Now
          </NavLink>
          <NavLink to="/history" className={navLink}>
            History
          </NavLink>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Log out"
            title="Log out"
            onClick={() => logout.mutate()}
            className="ml-1 text-muted-foreground"
          >
            <LogOut />
          </Button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
