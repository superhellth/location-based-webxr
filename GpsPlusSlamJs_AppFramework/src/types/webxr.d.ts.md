# webxr.d.ts

## Purpose

TypeScript declarations for WebXR and File System Access APIs not included in the standard `lib.dom.d.ts`.

## Declared Interfaces

### WebXR

| Interface          | Description                            |
| ------------------ | -------------------------------------- |
| `XRSystem`         | Navigator.xr methods                   |
| `XRSession`        | AR/VR session handle                   |
| `XRSessionInit`    | Session options (features, domOverlay) |
| `XRFrame`          | Per-frame data                         |
| `XRViewerPose`     | Camera pose                            |
| `XRView`           | Single view (eye)                      |
| `XRRigidTransform` | Position + orientation                 |
| `XRReferenceSpace` | Coordinate system                      |

### File System Access

| Interface                      | Description               |
| ------------------------------ | ------------------------- |
| `ShowDirectoryPickerOptions`   | Options for folder picker |
| `FileSystemDirectoryHandle`    | Directory operations      |
| `FileSystemFileHandle`         | File operations           |
| `FileSystemWritableFileStream` | Write stream              |

## Why Needed

These APIs are:

1. **Relatively new** - Not in all TypeScript lib versions
2. **Partial support** - Some features experimental
3. **Browser-specific** - Chrome-focused implementation

## Maintenance

Update these declarations when:

- TypeScript lib.dom includes them (can then remove)
- New WebXR features needed (depth sensing, etc.)
- File System Access API changes

## Reference

- [WebXR Device API](https://immersive-web.github.io/webxr/)
- [File System Access API](https://wicg.github.io/file-system-access/)
