# Prompt para Claude Design — UI de Lexora

> Copia TODO lo que hay debajo de la línea en Claude Design. Está afinado para que el diseño sea
> implementable sobre nuestra app real (Next.js App Router + Tailwind + shadcn/ui + next-intl) y la
> API ya construida (auth/RBAC, clientes, expedientes, documentos, tareas, ledger/facturación,
> portal, chat y notificaciones en tiempo real). "Lexora" es el nombre de producto; el repositorio
> se llama LegalFlow.

---

You are the Head of Product Design at Stripe, Linear, Attio and Vercel.

Design a world-class SaaS platform for law firms called **"Lexora"**. This is NOT traditional legal
software. It is an **AI-native operating system for modern law firms**, operating in **two
jurisdictions from day one: Spain and the Dominican Republic**.

## Avoid

- generic admin dashboards · blue sidebars · old legal aesthetics · gavels · courthouse columns ·
  scales of justice · enterprise software from 2015.

## It should feel like

Linear · Attio · Notion · Stripe Dashboard · Mercury · Arc Browser · Vercel.

## Design principles

premium · calm · high trust · high density · extremely modern · fast · **AI-native**.

## Visual language

glassmorphism used sparingly · layered surfaces · subtle gradients · large spacing · elegant
typography · floating navigation · sophisticated shadows · smooth animations · **command palette
first**.

## Technology assumptions

Next.js 15 · React 19 · Tailwind v4 · shadcn/ui · Framer Motion · Radix UI.
(Implementation note: our codebase currently runs Next.js 14 App Router + Tailwind 3 + next-intl;
keep the design adaptable to that. Define color tokens as CSS variables in the shadcn convention so
they drop into `globals.css`.)

## Product context that MUST shape the design

- **Two jurisdictions** selected per firm (tenant): **Spain (`es`)** → e-invoicing **Verifactu/AEAT**,
  **IVA 21% + IRPF withholding**, identifiers **NIF/CIF/NIE**, procedural deadlines in business days.
  **Dominican Republic (`do`)** → **e-CF/DGII**, **ITBIS 18%**, identifier **RNC/Cédula**. The UI
  must surface the right tax/compliance language per firm (don't hardcode one country).
- **Bilingual**: Spanish, locales **es-ES** and **es-DO**, with a language switcher. Amounts in
  **EUR** or **DOP** per firm, with locale-aware number/date formatting.
- **Three roles → two experiences**:
  1. **Firm app** for staff (**Firm Admin**, **Lawyer**) — dense, productivity-first.
  2. **Client Portal** (**Client**) — calmer, reassuring, read-only + chat.
- **AI-native**: a contextual **AI Assistant panel** (draft / summarize / review documents) that
  **always shows source citations and a confidence signal** (no hallucinations) — make this a
  first-class, recurring surface, not a gimmick.

## Build complete high-fidelity interfaces for (with the real data each must show)

1. **Login** — email + password; SSO/magic-link ready; subtle layered gradient; language switcher;
   firm context. Loading/error/disabled states.
2. **Firm onboarding** — elegant multi-step: firm name → **jurisdiction (Spain / Dominican Republic)**
   → **currency (EUR / DOP)** → **firm fiscal ID (NIF/CIF or RNC)** → first admin user. The
   jurisdiction choice live-updates the compliance copy (Verifactu vs e-CF). Progress + summary.
3. **Dashboard** — KPI cards (active matters, **upcoming procedural deadlines** with urgency,
   billables/revenue this month, pending document reviews), **activity timeline**, an **AI daily
   digest**, premium charts (revenue trend, deadline load). Command bar entry point.
4. **Clients** — high-density table: name, **fiscal ID (validated live)**, type, #matters, balance.
   Smart/semantic search, advanced filters, bulk actions, split-view to the profile.
5. **Client Profile** — split-view: header (name, fiscal ID, contact, **portal access status**),
   tabs (Matters, Documents, Invoices, Activity), running balance, "**Grant portal access**" action.
6. **Cases / Matters** — table + board toggle. Status badges: **Open · In progress · On hold ·
   Closed · Archived** (state machine). Responsible-lawyer avatar, client, reference (EXP-YYYY-NNNN),
   filters, smart search.
7. **Matter Detail** — the hero screen. Split-view with tabs: **Overview, Documents, Tasks, Time,
   Ledger/Costs, Chat, Activity**. A **state transition control** (only valid transitions),
   assignee, procedural deadlines, and a **contextual AI Assistant panel** scoped to the matter.
8. **Documents** — list grouped by document with **versions** and **review-status badges** (Pending,
   In review, Approved, Rejected, Changes requested); drag-and-drop upload; preview pane; size/mime.
9. **Document Review Workflow** — approve / reject / request changes with comment; **side-by-side
   version compare**; reviewer assignment; review timeline; resulting notification.
10. **Tasks** — list + filters (status / assignee / matter); create; **"Create from procedural
    deadline"** (deadline type + start date + days → jurisdiction-aware computed due date, holidays
    applied); overdue/upcoming urgency; keyboard-driven.
11. **Billing** — **transparent ledger per matter** (Provision, Disbursement, Time fee, Invoice,
    Payment, Adjustment) with a prominent running **balance**; invoice list; **"New invoice"** with
    line items and a **live tax preview** (base, IVA + IRPF / ITBIS, total) and the Verifactu/e-CF
    indicator.
12. **Invoice Detail** — fiscal header (issuer/buyer), line items, totals (taxable base, tax,
    withholding, total), status (Draft / Issued / Paid), **compliance record block** (Spain:
    Verifactu **hash + QR + chaining**; DR: **e-CF XML**), "Mark as paid", PDF/export.
13. **Notifications Center** — real-time feed, grouped, read/unread, types (document review, task
    assigned, new message). Bell with live count.
14. **Real-time Chat** — per-matter thread; participants = firm staff + the matter's client;
    presence, typing indicator, attachments, timestamps, optimistic send.
15. **Client Portal** — distinct, calmer surface: their matters with status, documents (download),
    **transparent ledger/costs**, their invoices, and chat with the firm. Reassuring, guided.
16. **Mobile responsive experience** — key flows on mobile (dashboard, matter detail, chat,
    approvals, notifications); floating navigation adapts; bottom command access.

## Cross-cutting requirements

split-view layouts · contextual navigation · **command bar (⌘K)** · **AI assistant panel (with
citations + confidence)** · activity timeline · keyboard shortcuts (document the map) · advanced
filters · smart/semantic search · premium charts · collaborative UI patterns (presence/cursors) ·
real-time updates · empty / loading (skeleton) / error states for every data view · full **dark and
light** themes · accessibility AA (contrast, focus rings, keyboard nav).

## Deliverables

1. **Design system**: tokens for **light + dark** (color in oklch, spacing, radius, shadows,
   typography with tabular numerals for money/dates), in shadcn/ui CSS-variable convention.
2. **High-fidelity mockups** of all 16 screens (desktop) + the mobile experience.
3. **Component hierarchy** and a **spacing/type scale**.
4. **Interaction states**, **animations** (Framer Motion specs: durations/easings), and **responsive
   behavior**.
5. **Implementation notes** for **Next.js + Tailwind + shadcn/ui** — concrete component mapping
   (Button, Card, Table, Dialog, Sheet, Tabs, Badge, Command, DropdownMenu, Tooltip, Toast, Avatar,
   Skeleton, Popover, ScrollArea), class/variable references, not just images.

Every screen should look like a **2026 SaaS unicorn worth $100M+ ARR**: premium, calm, fast,
AI-native, and unmistakably modern. Prioritize that it is **implementable quickly** on shadcn/ui.
