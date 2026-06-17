import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  LayoutTemplate,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

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
}

export interface NavGroup {
  /** clave i18n bajo `nav.groups.*` */
  key: string;
  items: NavItem[];
}

/**
 * Sidebar del despacho (staff), AGRUPADO igual que la plantilla (Lexora.dc.html 112–192):
 * Espacio de trabajo · Finanzas · Comunicación · Despacho.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'workspace',
    items: [
      { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, enabled: true },
      { key: 'matters', href: '/matters', icon: Briefcase, enabled: true },
      { key: 'clients', href: '/clients', icon: Users, enabled: true },
      { key: 'tasks', href: '/tasks', icon: CheckSquare, enabled: true },
      { key: 'time', href: '/time', icon: Clock, enabled: true },
      { key: 'documents', href: '/documents', icon: FileText, enabled: true },
      { key: 'templates', href: '/templates', icon: LayoutTemplate, enabled: true },
    ],
  },
  {
    key: 'finance',
    items: [
      { key: 'billing', href: '/billing', icon: Receipt, enabled: true },
      { key: 'invoices', href: '/invoices', icon: ReceiptText, enabled: true },
    ],
  },
  {
    key: 'comms',
    items: [{ key: 'chat', href: '/messages', icon: MessageSquare, enabled: true }],
  },
  {
    key: 'admin',
    items: [
      { key: 'calendar', href: '/calendar', icon: CalendarDays, enabled: true },
      { key: 'aml', href: '/aml', icon: ShieldCheck, enabled: true },
      // Grupo «Despacho» admin (Tanda B). Solo FIRM_ADMIN.
      { key: 'reports', href: '/reports', icon: BarChart3, enabled: true, adminOnly: true },
      { key: 'approvals', href: '/approvals', icon: BadgeCheck, enabled: true, adminOnly: true },
      { key: 'audit', href: '/audit', icon: ScrollText, enabled: true, adminOnly: true },
      { key: 'settings', href: '/settings', icon: Settings, enabled: true, adminOnly: true },
    ],
  },
];

/** Lista plana (paleta de comandos, breadcrumbs…). Derivada de los grupos. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
