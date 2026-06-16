'use client';

import { useTranslations } from 'next-intl';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/i18n/navigation';
import { scopeFromRoles } from '@/lib/scope';
import { jurisdictionCopy } from '@/lib/jurisdiction';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const t = useTranslations('userMenu');
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;
  const copy = jurisdictionCopy(user.jurisdiction);
  const accountHref = scopeFromRoles(user.roles) === 'client' ? '/portal/account' : '/account';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={t('open')}>
          <Avatar>
            <AvatarFallback>{initials(user.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm">{user.email}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {copy.country} · {user.roles.join(', ')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(accountHref)}>
          <ShieldCheck />
          {t('account')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <LogOut />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
