/**
 * Minimal-Typen für die Teile der File System Access API, die TypeScripts
 * Standard-`lib.dom` (Stand TS 5.7) noch nicht kennt. Nur Chromium implementiert
 * diese; der Aufrufer prüft das zur Laufzeit über supportsFileSystemAccess().
 *
 * `FileSystemFileHandle`, `createWritable`, `getFile` etc. stehen bereits in
 * lib.dom — hier nur die Ergänzungen: die Berechtigungs-Methoden am Handle und
 * die Picker-Funktionen am Window.
 */
export {}

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>
  }

  interface FilePickerAcceptType {
    description?: string
    accept: Record<string, string | string[]>
  }

  interface OpenFilePickerOptions {
    multiple?: boolean
    excludeAcceptAllOption?: boolean
    types?: FilePickerAcceptType[]
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    excludeAcceptAllOption?: boolean
    types?: FilePickerAcceptType[]
  }

  interface Window {
    showOpenFilePicker(
      options?: OpenFilePickerOptions,
    ): Promise<FileSystemFileHandle[]>
    showSaveFilePicker(
      options?: SaveFilePickerOptions,
    ): Promise<FileSystemFileHandle>
  }
}
