/**
 * Global TypeScript declarations for browser APIs used by the framework.
 *
 * File System Access API types for showSaveFilePicker and showDirectoryPicker.
 * These are not yet in the standard lib.dom.d.ts.
 */

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?:
    | FileSystemHandle
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos';
}

declare global {
  interface Window {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions
    ) => Promise<FileSystemDirectoryHandle>;

    showSaveFilePicker?: (
      options?: SaveFilePickerOptions
    ) => Promise<FileSystemFileHandle>;
  }

  function showDirectoryPicker(
    options?: DirectoryPickerOptions
  ): Promise<FileSystemDirectoryHandle>;

  function showSaveFilePicker(
    options?: SaveFilePickerOptions
  ): Promise<FileSystemFileHandle>;
}

export {};
