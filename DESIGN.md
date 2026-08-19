# 我的故事词汇学习器 Design System

## 1. Atmosphere & Identity

这是一个安静、轻量、适合手机连续复习的故事词汇学习器。签名是“阅读故事后逐层下潜到词卡”：浅灰页面、白色卡片和紫色学习动作形成清晰层级，不用复杂装饰打断记忆路径。

## 2. Color

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Page background | `--bg` | `#f5f6fb` | 页面底色 |
| Card surface | `--card` | `#ffffff` | 内容卡片、输入框 |
| Primary text | `--ink` | `#172033` | 标题、正文 |
| Muted text | `--muted` | `#6b7280` | 辅助说明 |
| Border | `--line` | `#e5e7eb` | 卡片和控件边界 |
| Brand | `--brand` | `#5b4cf0` | 当前项、主要动作、发音状态 |
| Soft brand | `--soft` | `#efedff` | 次级动作、聚焦背景 |
| Success | `--good` / `--goodbg` | `#087443` / `#ecfdf3` | 完成状态 |
| Destructive | `--bad` / `--badbg` | `#b42318` / `#fff1f0` | 删除、错误提示 |

## 3. Typography

- Primary: `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
- Page brand: 20px / 900
- Card title: 23px / 950 / 1.25
- Word title: 22px / 950
- Body: 16px / 1.9 in stories
- Supporting text: 13–14px / 1.6–1.75

## 4. Spacing & Layout

- Base unit: 4px; common gaps are 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px. The new story-edit controls use the existing `--line`, `--card`, `--bad`, and `--muted` semantic tokens.
- Content shell: max-width 620px, centered on wider screens.
- Mobile-first: story picker uses three columns; expanded picker owns its own vertical scroll.
- Bottom navigation remains fixed and reserves safe-area space.

## 5. Components

### Story picker
- **Structure**: compact grid of story buttons plus an optional expandable scroll region.
- **States**: default, active, complete, expanded, long-press edit mode, focus-visible.
- **Interaction**: hold for 520ms with no more than 10px movement to enter edit mode; the edit mode reveals small destructive `×` controls on every story and a compact “完成” exit action.
- **Accessibility**: native buttons, visible focus ring, completion mark is supplementary; right-click provides a desktop equivalent to long press.

### Word card
- **Structure**: English word, Chinese meaning, memory hook, expandable details, back-to-story action.
- **States**: default, expanded details, focus-visible; story-body word links trigger the shared speech behavior.
- **Accessibility**: story-body vocabulary links remain native text elements with clear hover/focus treatment.

### Destructive story action
- **Structure**: small `×` control anchored to each story button, available only in long-press edit mode.
- **States**: hidden, edit mode, confirmation, disabled when only one story remains.
- **Accessibility**: native buttons with story-specific labels; browser confirmation prevents accidental deletion.

## 6. Motion & Interaction

- Existing smooth scroll and backdrop blur are retained.
- Long press follows the context-menu gesture pattern: 520ms hold, 10px movement tolerance, pointer cancel on drag, and a compact edit-state reveal.
- New controls use short opacity/color feedback only; no layout animation is introduced.
- Web Speech playback is a browser capability. If unavailable, the UI reports that state without breaking study.
- `prefers-reduced-motion` remains respected by the existing smooth-scroll behavior through a CSS override.

## 7. Depth & Surface

Mixed strategy: 1px borders define card boundaries and the existing soft shadow lifts cards from the page. Destructive confirmation uses the same card surface with the existing error palette.

## 8. Accessibility Constraints & Accepted Debt

- WCAG 2.2 AA target for contrast, keyboard reachability, visible focus, semantic buttons and labeled inputs.
- Accepted debt: browser speech voice availability varies by device and OS; the app cannot guarantee a particular voice, so it requests `en-US` and reports unsupported playback.

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Legacy inline CSS uses direct color, type and spacing values in addition to the root palette | `index.html` existing style block | This feature task preserves the shipped visual system and only adds the small story-edit interaction; broad token migration would be an unrelated redesign | Future design-system cleanup |
