# DO_NOT_TOUCH.md — Sacred Architecture

## Warning

Modifying anything in this file will break the core interaction model.

**DO NOT TOUCH** unless explicitly instructed by @hallberg.

## Protected Folders & Logic

### `/components/window/`

- **Window.tsx**: Handles drag, resize, and focus logic

- **Window.css**: Spatial semantics and pointer zones

- **Pointer Event Handlers**: `onPointerDown`, `onPointerMove`, `onPointerUp`

- **Pointer Capture Logic**: Enforced during drag/resize

### `/system/`

- **Desktop.tsx**: Background, spatial grid, window mounting

- **Focus Logic**: Which window is active

- **Z-Index Management**: Window stacking order

### `/themes/`

- **Color Tokens**: Root colors (`--root-green`, `--root-yellow`, etc.)

- **Typography Scale**: Font families and sizes

- **Spacing Scale**: Consistent padding/margins

### `/lib/`

- **Spatial Utils**: Grid calculations, positioning helpers

- **Type Definitions**: Core interfaces for windows, devices, zones

## Red Lines

- Never modify pointer event handling

- Never change root color tokens

- Never break window containment

- Never remove pointer capture

- Never assume screen size

## How to Work Around

If you need something from these areas:

1. Create a wrapper component

2. Use props to control behavior

3. Ask for a helper function

4. Never edit directly

#hallbergstrong.

So say we all.
