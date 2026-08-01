export interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface Picker {
  showOpenFilePicker?: (options?: unknown) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileHandleLike>;
}

const picker = window as unknown as Picker;

const YAML_TYPE = [
  { description: 'YAML', accept: { 'application/yaml': ['.yaml', '.yml'], 'text/yaml': ['.yaml', '.yml'] } },
];

export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileHandleLike;
}

/** Pick a file with the OS dialog when available, otherwise a hidden file input. */
export async function openFile(): Promise<OpenedFile | null> {
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({ types: YAML_TYPE, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: handle.name, text: await file.text(), handle };
    } catch {
      return null; // dialog dismissed
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/yaml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SaveResult = { saved: false } | { saved: true; name: string; handle?: FileHandleLike };

/**
 * Write back to the opened file when the browser allows it, prompt for a location on
 * first save, and fall back to a download where the API is unsupported.
 */
export async function saveFile(name: string, text: string, handle?: FileHandleLike): Promise<SaveResult> {
  try {
    let target = handle;
    if (!target) {
      if (!picker.showSaveFilePicker) {
        download(name, text);
        return { saved: true, name };
      }
      target = await picker.showSaveFilePicker({ suggestedName: name, types: YAML_TYPE });
    }
    const stream = await target.createWritable();
    await stream.write(text);
    await stream.close();
    return { saved: true, name: target.name, handle: target };
  } catch {
    return { saved: false };
  }
}
