import {
  Briefcase,
  CalendarDays,
  CheckSquare,
  FileText,
  LayoutDashboard,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** clave i18n bajo `nav.*` */
  key: string;
  /** ruta sin locale (el Link localizado lo prefija) */
  href: string;
  icon: LucideIcon;
  /** false = sección aún no construida (slices F1+); se muestra deshabilitada. */
  enabled: boolean;
}

/** Secciones del despacho (staff). El orden refleja el sidebar del diseño. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, enabled: true },
  { key: 'matters', href: '/matters', icon: Briefcase, enabled: true },
  { key: 'clients', href: '/clients', icon: Users, enabled: true },
  { key: 'documents', href: '/documents', icon: FileText, enabled: false },
  { key: 'tasks', href: '/tasks', icon: CheckSquare, enabled: true },
  { key: 'calendar', href: '/calendar', icon: CalendarDays, enabled: true },
  { key: 'billing', href: '/billing', icon: Receipt, enabled: false },
];
