# FAQ Tab Implementation - Base Mini App

## Overview
Implemented a tab-based navigation system in the navbar to toggle between Home and FAQ sections, optimized for Base Mini App experience.

## Changes Made

### 1. **State Management** (`app/page.tsx`)
- Added `showFAQ` state to control which view is displayed
- Default: `false` (shows Home view)
- Toggles between Home and FAQ content

### 2. **Navbar Enhancement** (`app/page.tsx`)
```tsx
<nav className={styles.navbar}>
  <div className={styles.logo}>...</div>
  
  {/* NEW: Tab Navigation */}
  <div className={styles.navbarTabs}>
    <button className={navTab} onClick={() => setShowFAQ(false)}>
      Home
    </button>
    <button className={navTab} onClick={() => setShowFAQ(true)}>
      FAQ
    </button>
  </div>
  
  <div className={styles.navbarConnect}>...</div>
</nav>
```

### 3. **Conditional Rendering** (`app/page.tsx`)
```tsx
<div className={styles.content}>
  {showFAQ ? (
    <FAQ />
  ) : (
    <div className={styles.statsWrap}>
      {/* All stats, charts, minting UI */}
    </div>
  )}
</div>
```

### 4. **Navbar Styling** (`app/page.module.css`)

#### Desktop
- **navbarTabs**: Flex container centered between logo and connect button
- **navTab**: Clean button with hover effects
- **navTabActive**: Cyan highlight with underline indicator
- Smooth transitions and hover states

#### Mobile (Base Mini App)
- Compact spacing for small screens
- Reduced font sizes (0.75rem)
- Smaller padding and gaps
- Touch-friendly tap targets
- Responsive layout that fits mini app viewport

### 5. **FAQ Component Styling** (`app/components/FAQ.module.css`)
Updated for in-app rendering:
- Removed border-top (no longer at page bottom)
- Transparent background (inherits from container)
- Adjusted padding for better spacing
- Full viewport height for better UX

## User Experience

### Navigation Flow
1. **Default View**: User lands on Home (stats/minting UI)
2. **Click FAQ Tab**: Switches to FAQ view
3. **Click Home Tab**: Returns to stats view
4. **Active Indicator**: Cyan highlight shows current tab

### Visual Design
- **Active Tab**: 
  - Cyan text color (#00ffff)
  - Light cyan background
  - Bottom border indicator
- **Inactive Tab**:
  - Muted white (60% opacity)
  - Transparent background
  - Hover effect on interaction

### Mobile Optimization
- Compact navbar (fits Base Mini App width ~375px)
- Readable tab labels at small sizes
- Touch-friendly buttons (min 44px height)
- Responsive text sizing
- No horizontal scroll

## Benefits

1. **Clean UI**: FAQ is accessed via tab, not scroll
2. **Fast Access**: One click to FAQ, one click back
3. **Space Efficient**: No need for footer or separate page
4. **Mobile Friendly**: Optimized for Base Mini App constraints
5. **State Preservation**: Wallet stays connected when switching tabs
6. **Performance**: Only renders active view (conditional rendering)

## Technical Details

### State Management
- Single boolean state (`showFAQ`)
- Simple toggle logic
- No routing needed (single-page app)

### Navbar Layout
- **Logo**: Left (flex-shrink: 0)
- **Tabs**: Center (flex: 1, max-width: 300px)
- **Connect**: Right (min-width: 120px)

### Mobile Breakpoint
- Triggers at 640px and below
- Adjusts all navbar elements
- Maintains functionality and readability

## Future Enhancements

Potential improvements:
- Add more tabs (About, Docs, etc.)
- Slide animation on tab switch
- Breadcrumb navigation
- Deep linking to specific FAQ items
- Remember last viewed tab (localStorage)

