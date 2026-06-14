import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Navegación localizada (Link/useRouter prefijan el locale automáticamente). */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
