# SCARO ERP Design System

This document outlines the core design principles and tokens used in the SCARO ERP application.

## 1. Design Philosophy
- **Professional & Operational**: Clean, restrained, and data-dense without feeling crowded.
- **Avoid Clichés**: No excessive gradients, glassmorphism, or unnecessary animations.
- **Accessible**: High contrast, semantic HTML, and clear focus states.

## 2. Color System
We use a semantic color token system defined in `tailwind.config.js`. Avoid using hardcoded raw hex values or arbitrary colors in components.

- **Primary**: `bg-primary`, `text-primary` (Warm Orange) - Used for primary actions and active states.
- **Surface**: `bg-surface` (White) and `bg-surface-muted` (Light Gray/Off-white) - Used for backgrounds and cards.
- **Content**: `text-content` (Charcoal) and `text-content-muted` (Neutral Gray) - Used for text hierarchy.
- **Border**: `border-border` - Used for subtle separation.
- **Status Colors**: 
  - `status-success` (Restrained Green)
  - `status-warning` (Amber)
  - `status-danger` (Red)
  - `status-info` (Muted Blue)

## 3. Typography
- **Font Family**: Inter, Roboto, sans-serif.
- **Usage**: Stick to standard Tailwind text sizes (`text-xs` to `text-2xl`). Avoid oversized headings. Maintain readability for data tables and dense UI.

## 4. Spacing & Sizing
- Utilize standard Tailwind spacing (`p-4`, `m-2`, `gap-4`).
- Components are designed to be compact (e.g., standard input height is `h-10`, small buttons `h-8`).

## 5. Core Components (`src/components/ui/`)
- **Button**: Supports multiple variants (`primary`, `secondary`, `outline`, `ghost`, `danger`) and sizes (`sm`, `md`, `lg`). Includes `isLoading` state.
- **Input/Select/Textarea**: Standardized form controls with accessible labels, error states, and consistent focus rings.
- **Card**: Container for grouping related content (`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`).
- **Modal/Dropdown**: Simple, accessible overlay components managing focus and outside-clicks.
- **States**: `EmptyState`, `LoadingState`, `ErrorState` used for data fetching and placeholders.

## 6. Application Shell (`src/layouts/AppLayout.tsx`)
- **Sidebar**: Persistent on desktop, collapsible on mobile/tablet. Contains main navigation grouped by business function.
- **Header**: Contains search, notifications, and a profile dropdown menu.
- **Responsive Behavior**: On small screens, the sidebar becomes an off-canvas drawer controlled by a hamburger menu in the header.

## 7. Accessibility
- All interactive elements use `focus-visible` for keyboard navigation.
- Semantic HTML tags are used (`nav`, `header`, `aside`, `main`).
- Modals trap focus and manage body scroll.
