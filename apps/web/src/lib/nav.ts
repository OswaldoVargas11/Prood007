import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Clock,
  CreditCard,
  ClipboardList,
  FileText,
  Gavel,
  HelpCircle,
  LayoutTemplate,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Feature } from '@/lib/auth-types';

export interface NavItem {
  /** clave i18n bajo `nav.*` */
  key: string;
  /** ruta sin locale (el Link localizado lo prefija) */
  href: string;
  icon: LucideIcon;
  /** false = sección aún no construida (su backend llega en la Tanda B); se muestra deshabilitada. */
  enabled: boolean;
  /** true = solo visible para FIRM_ADMIN (grupo «Despacho» admin de la plantilla). */
  adminOnly?: boolean;
  /** Si la sección requiere un tier: cuando el plan no la incluye, se muestra BLOQUEADA (CTA a planes). */
  feature?: Feature;
}

export interface NavGroup {
  /** clave i18n bajo `nav.groups.*` */
  key: string;
  items: NavItem[];
}

/**
 * Sidebar del despacho (staff), AGRUPADO por afinidad de tarea para reducir el ruido y que sea fácil
 * de escanear: Espacio de trabajo · Documentación · Comunicación · Finanzas · Tramitación · Despacho.
 * El grupo «Despacho» es solo-admin; el resto, todo el staff (algún item puede bloquearse por plan).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'workspace',
    items: [
      { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, enabled: true },
      { key: 'matters', href: '/matters', icon: Briefcase, enabled: true },
      { key: 'clients', href: '/clients', icon: Users, enabled: true },
      { key: 'leads', href: '/leads', icon: Target, enabled: true },
      { key: 'tasks', href: '/tasks', icon: CheckSquare, enabled: true },
      { key: 'calendar', href: '/calendar', icon: CalendarDays, enabled: true },
      { key: 'time', href: '/time', icon: Clock, enabled: true },
      { key: 'help', href: '/ayuda', icon: HelpCircle, enabled: true },
    ],
  },
  {
    key: 'docs',
    items: [
      { key: 'documents', href: '/documents', icon: FileText, enabled: true },
      {
        key: 'templates',
        href: '/templates',
        icon: LayoutTemplate,
        enabled: true,
        feature: 'templates',
      },
      { key: 'presentations', href: '/presentations', icon: ClipboardList, enabled: true },
    ],
  },
  {
    key: 'comms',
    items: [{ key: 'chat', href: '/messages', icon: MessageSquare, enabled: true }],
  },
  {
    key: 'finance',
    items: [
      { key: 'billing', href: '/billing', icon: Receipt, enabled: true },
      { key: 'invoices', href: '/invoices', icon: ReceiptText, enabled: true },
    ],
  },
  {
    key: 'practice',
    items: [
      { key: 'scheduling', href: '/scheduling', icon: CalendarClock, enabled: true },
      { key: 'lexnet', href: '/lexnet', icon: Gavel, enabled: true },
      { key: 'aml', href: '/aml', icon: ShieldCheck, enabled: true },
    ],
  },
  {
    key: 'admin',
    items: [
      // Grupo «Despacho»: solo FIRM_ADMIN.
      { key: 'reports', href: '/reports', icon: BarChart3, enabled: true, adminOnly: true },
      { key: 'approvals', href: '/approvals', icon: BadgeCheck, enabled: true, adminOnly: true },
      { key: 'audit', href: '/audit', icon: ScrollText, enabled: true, adminOnly: true },
      { key: 'import', href: '/import', icon: Upload, enabled: true, adminOnly: true },
      {
        key: 'subscription',
        href: '/subscription',
        icon: CreditCard,
        enabled: true,
        adminOnly: true,
      },
      { key: 'settings', href: '/settings', icon: Settings, enabled: true, adminOnly: true },
    ],
  },
];

/** Lista plana (paleta de comandos, breadcrumbs…). Derivada de los grupos. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
