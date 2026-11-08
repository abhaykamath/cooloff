import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { loginSchema, type LoginInput } from '@cb/shared';
import { useLogin, useMe } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { password: '' } });

  if (me.isSuccess) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await login.mutateAsync(password);
      navigate(from, { replace: true });
    } catch (err) {
      form.setError('password', { message: err instanceof Error ? err.message : 'Login failed' });
      form.setFocus('password');
    }
  });

  const error = form.formState.errors.password?.message;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-5xl font-extrabold tracking-[-0.035em]">Cooloff</h1>
      <p className="mt-3 text-muted-foreground">Enter your password to see what's cooling.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-3" noValidate>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? 'password-error' : undefined}
          className="h-11 bg-card text-base"
          {...form.register('password')}
        />
        {error && (
          <p id="password-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={login.isPending}>
          {login.isPending && <LoaderCircle className="animate-spin" />}
          Log in
        </Button>
      </form>
    </main>
  );
}
