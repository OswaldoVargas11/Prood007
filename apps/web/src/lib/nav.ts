import {
  BadgeCheck,
  Briefcase,
  CalendarDays,
  CheckSquare,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
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
      { key: 'documents', href: '/documents', icon: FileText, enabled: true },
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
      // Pendientes de su backend (Tanda B): aprobaciones, auditoría y ajustes. Solo FIRM_ADMIN.
      { key: 'approvals', href: '/approvals', icon: BadgeCheck, enabled: false, adminOnly: true },
      { key: 'audit', href: '/audit', icon: ScrollText, enabled: false, adminOnly: true },
      { key: 'settings', href: '/settings', icon: Settings, enabled: false, adminOnly: true },
    ],
  },
];

/** Lista plana (paleta de comandos, breadcrumbs…). Derivada de los grupos. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
