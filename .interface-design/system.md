# TrendPulse Design System

## Direction: Warmth & Approachability

A creative content generation SaaS that feels like chatting with a helpful friend — approachable, clear, and visually confident without being loud.

## Design Tokens

### Spacing

Base unit: 4px (Tailwind default)

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4px (gap-1, p-1) | Inline icon gaps, tight labels |
| `space-sm` | 6px (gap-1.5, p-1.5) | Badge padding, compact lists |
| `space-md` | 8px (gap-2, p-2) | Default gap between siblings |
| `space-lg` | 12px (gap-3, p-3) | Section padding, input padding |
| `space-xl` | 16px (gap-4, p-4) | Card padding, page margins |
| `space-2xl` | 24px (p-6) | Card header/content, section spacing |
| `space-3xl` | 32px (p-8) | Page-level vertical rhythm |

**Rule:** Never use arbitrary values (p-[13px]). Stick to the scale.

### Border Radius

| Token | Value | Class | Usage |
|-------|-------|-------|-------|
| `radius-sm` | 6px | `rounded-md` | Buttons, inputs, small interactive elements |
| `radius-md` | 8px | `rounded-lg` | Cards, modals, dropdowns — **default** |
| `radius-lg` | 12px | `rounded-xl` | Feature cards, hero sections, image containers |
| `radius-full` | 50% | `rounded-full` | Avatars, badges, pills, icon buttons |

**Rule:** Do NOT use `rounded-sm` (3px) or `rounded-2xl` (16px). Keep to 3 tiers + full.

### Colors

TrendPulse uses CSS custom properties via shadcn/ui. The semantic layer:

| Role | Token | Usage |
|------|-------|-------|
| **Primary** | `primary` | CTAs, active states, links |
| **Primary/10** | `primary/10` | Tinted backgrounds, hover states |
| **Primary/5** | `primary/5` | Subtle highlights, selected rows |
| **Muted** | `muted` | Secondary backgrounds, disabled states |
| **Muted-foreground** | `muted-foreground` | Secondary text, helper text, icons |
| **Foreground** | `foreground` | Body text |
| **Card** | `card` | Card surfaces |
| **Background** | `background` | Page background |
| **Destructive** | `destructive` | Delete, errors |
| **Amber** | `amber-500` | Warnings, pending states |
| **Green** | `green-500` | Success, published states |

**Opacity scale for primary:** 5%, 10%, 20%, 30%, 50% only. No arbitrary opacities.

**Rule:** Never use raw hex/rgb. Always use semantic tokens.

### Typography

| Role | Classes | Usage |
|------|---------|-------|
| **Page title** | `text-2xl font-heading font-bold` | Top-level page headings |
| **Section title** | `text-lg font-semibold` | Card titles, section headings |
| **Body** | `text-sm font-medium` | Standard text, buttons |
| **Small** | `text-xs text-muted-foreground` | Labels, timestamps, helper text |
| **Mono** | `text-xs font-mono` | Technical values, IDs |

**Font weights:** `font-medium` (default body), `font-semibold` (emphasis), `font-bold` (headings only).

**Rule:** Never use `font-light` or `font-thin`. Warmth needs substance.

### Depth Strategy: Borders-First

The codebase uses borders 3.3x more than shadows. Keep it that way.

| Level | Treatment | Usage |
|-------|-----------|-------|
| **Flat** | No border, no shadow | Inline elements, text |
| **Subtle** | `border border-border/50` | Input fields, dividers |
| **Default** | `border shadow-sm` | Cards, dropdowns |
| **Elevated** | `border shadow-card` | Popovers, floating cards |
| **Overlay** | `shadow-lg` | Modals, toasts |

**Rule:** Never combine heavy borders with heavy shadows. Pick one per level.

### Icons

All icons from `lucide-react`.

| Size | Classes | Usage |
|------|---------|-------|
| **Tiny** | `w-3 h-3` | Inline indicators, badges |
| **Small** | `w-3.5 h-3.5` | Compact buttons, tags |
| **Default** | `w-4 h-4` | Buttons, list items, inputs |
| **Medium** | `w-5 h-5` | Standalone actions, navigation |
| **Large** | `w-6 h-6` or `w-8 h-8` | Empty states, feature icons |

**Color:** `text-primary` for actions, `text-muted-foreground` for decorative.

**Rule:** Loading spinners always use `w-4 h-4 animate-spin` unless in a hero/empty state.

## Component Patterns

### Button

```
Default:  h-10 px-4 py-2 text-sm font-medium rounded-md gap-2
Small:    h-9 px-3 text-sm rounded-md
Icon:     h-10 w-10 rounded-md (square, centered icon)
```

**Variant priority:** outline > ghost > secondary > default > destructive

- **outline** (44%): Secondary actions, filters, toggles
- **ghost** (31%): Toolbar actions, close buttons, minimal UI
- **secondary** (14%): Alternative prominent actions
- **default** (solid primary): Primary CTA only — max 1 per view

**Rule:** Never put two solid primary buttons in the same view section.

### Card

```
Base:     border rounded-lg bg-card shadow-sm
Header:   p-6 space-y-1.5
Content:  p-6 pt-0
Footer:   p-6 pt-0 flex items-center
```

**Variants:**
- **Interactive card:** Add `hover:shadow-card-hover transition-shadow duration-200`
- **Selected card:** Add `border-primary/30 bg-primary/5`
- **Muted card:** Use `bg-muted/50 border-border/50`

### Input

```
Base:     h-10 px-3 text-sm border rounded-md bg-background
Focus:    ring-2 ring-primary/20 border-primary
```

### Chat Message (TrendPulse-specific)

```
User:       bg-primary/10 rounded-xl rounded-br-md p-3 text-sm
Assistant:  bg-muted/50 rounded-xl rounded-bl-md p-3 text-sm
Action:     border rounded-lg bg-card shadow-sm (ActionCard)
```

## Animation Defaults

| Trigger | Treatment |
|---------|-----------|
| **Hover** | `transition-colors duration-200` |
| **Expand/Collapse** | `transition-all duration-300` |
| **Fade in** | `animate-fade-in` or `animate-in` |
| **Loading** | `animate-spin` on icon (never full skeleton for < 2s) |
| **State change** | `transition-opacity duration-200` |

**Rule:** Max duration 300ms for interactive feedback. 500ms only for layout shifts.

## Layout

### Page Structure
```
<div className="min-h-screen bg-background">
  <nav /> <!-- sticky top, bg-background/80 backdrop-blur -->
  <main className="mx-auto max-w-7xl px-4 py-8">
    <!-- content -->
  </main>
</div>
```

### Grid
- **1 column:** Mobile default
- **2 columns:** `grid grid-cols-1 md:grid-cols-2 gap-4`
- **3 columns:** Only for gallery/card grids on wide screens

### Flex
- **Row with gap:** `flex items-center gap-2`
- **Column list:** `flex flex-col space-y-2` or `flex flex-col gap-2`
- **Space between:** `flex items-center justify-between`

## Anti-Patterns (Do NOT)

1. **No `rounded-sm`** — too sharp for warmth. Minimum is `rounded-md`.
2. **No `font-light`/`font-thin`** — too wispy. Medium is the floor.
3. **No raw hex colors** — always semantic tokens.
4. **No `shadow-2xl` on cards** — too dramatic. Max `shadow-lg` for modals.
5. **No arbitrary spacing** — no `p-[13px]` or `gap-[7px]`.
6. **No more than 1 solid primary button per view section.**
7. **No `animate-bounce`** — playful but distracting. Use `animate-fade-in`.
8. **No nested cards** — card inside card creates visual noise.
