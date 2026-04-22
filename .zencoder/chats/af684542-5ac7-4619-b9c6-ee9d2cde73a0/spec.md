# Technical Specification - Sunbird Menu Enhancement

## Technical Context
- **Language**: CSS, JavaScript (Browser-side)
- **Framework**: Vanilla JS, Custom CSS (Liquid Glass UI)
- **Target Files**: 
    - `css/clientportal.css`
    - `js/clientportal.js`

## Implementation Approach

### 1. CSS Enhancements (`css/clientportal.css`)
- **Variables**: Define `--sunbird-menu-width` and `--sunbird-menu-left-gap` in `:root` for easier management.
    - Set `--sunbird-menu-width: 210px;` (increased from 180px).
    - Set `--sunbird-menu-left-gap: 32px;` (increased from 28px) to ensure it doesn't "touch" the billing card visually.
- **Menu Header**: Add a new class `.sunbird-menu-header` for the "Control Center" heading.
    - Styles: Uppercase, small font size (0.65rem), bold (font-weight: 600), color: rgba(255, 255, 255, 0.5), margin-bottom: 12px, padding-left: 14px, letter-spacing: 0.1em.
- **Menu Adjustments**: 
    - Update `.sunbird-left-menu` to use these variables (already does with defaults, but explicit definition is better).
    - Ensure `.sunbird-left-menu` has `padding-top: 20px;` to accommodate the header.

### 2. JavaScript Enhancements (`js/clientportal.js`)
- **Menu Initialization**: 
    - Update `initializeSunbirdLeftMenu()` to include the "Control Center" heading at the top of the `innerHTML`.
    - Add the "Operations" button after "Architecture" or "Reports".
    - Button icon: `fas fa-cogs` or `fas fa-microchip`.
- **Menu Switching**:
    - Update `window.switchBillingMenu()` to include `operations` in the `placeholderViews` object so it shows a placeholder view when clicked.

## Source Code Structure Changes
- No new files.
- Modified `css/clientportal.css`.
- Modified `js/clientportal.js`.

## Data Model / API / Interface Changes
- None. "Operations" will use a placeholder view initially.

## Verification Approach
- **Manual Verification**: 
    - Log in as a Sunbird user.
    - Check the dashboard.
    - Verify the menu width and gap.
    - Verify the "Control Center" heading appearance.
    - Verify the "Operations" button exists and shows a placeholder view when clicked.
- **Linting**: Run any available linters (none specified, but I will check for general syntax errors).
