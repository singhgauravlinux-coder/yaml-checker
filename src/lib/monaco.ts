import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
// Only the editor features this app uses. Importing `monaco-editor` or `editor.all.js`
// instead would add the TS/JSON/CSS/HTML language services and roughly double the bundle.
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError.js';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/esm/vs/editor/contrib/message/browser/messageController.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

(self as unknown as { MonacoEnvironment: { getWorker(): Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export type ThemeName = 'plumb-dark' | 'plumb-light';

monaco.editor.defineTheme('plumb-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'ced8e0' },
    { token: 'type', foreground: '6fb3de' },
    { token: 'string', foreground: 'c9d6de' },
    { token: 'string.yaml', foreground: 'c9d6de' },
    { token: 'number', foreground: 'd6a147' },
    { token: 'keyword', foreground: '9fd0a8' },
    { token: 'comment', foreground: '65747f', fontStyle: 'italic' },
    { token: 'tag', foreground: 'd6a147' },
    { token: 'operators', foreground: '8a99a6' },
    { token: 'delimiter', foreground: '8a99a6' },
  ],
  colors: {
    'editor.background': '#121820',
    'editor.foreground': '#ced8e0',
    'editorLineNumber.foreground': '#3c4a57',
    'editorLineNumber.activeForeground': '#8fa7bb',
    'editorCursor.foreground': '#5fa8da',
    'editor.selectionBackground': '#25415a',
    'editor.inactiveSelectionBackground': '#1c2c3a',
    'editor.lineHighlightBackground': '#171f28',
    'editorIndentGuide.background1': '#202c37',
    'editorIndentGuide.activeBackground1': '#365064',
    'editorWhitespace.foreground': '#2b3844',
    'editorGutter.background': '#121820',
    'editorError.foreground': '#e06c7e',
    'editorWarning.foreground': '#d6a147',
    'minimap.background': '#101620',
    'scrollbarSlider.background': '#24303b80',
    'scrollbarSlider.hoverBackground': '#2f3f4d',
    'scrollbarSlider.activeBackground': '#3b4f60',
    'editorWidget.background': '#151c23',
    'editorWidget.border': '#24303b',
    'input.background': '#101620',
    'input.border': '#24303b',
    'focusBorder': '#5fa8da',
  },
});

monaco.editor.defineTheme('plumb-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '1c232b' },
    { token: 'type', foreground: '1f5c8b', fontStyle: 'bold' },
    { token: 'string', foreground: '2b3742' },
    { token: 'string.yaml', foreground: '2b3742' },
    { token: 'number', foreground: '8a5a12' },
    { token: 'keyword', foreground: '166950' },
    { token: 'comment', foreground: '78858f', fontStyle: 'italic' },
    { token: 'tag', foreground: '8a5a12' },
    { token: 'operators', foreground: '68757f' },
    { token: 'delimiter', foreground: '68757f' },
  ],
  colors: {
    'editor.background': '#fbfcfd',
    'editor.foreground': '#1c232b',
    'editorLineNumber.foreground': '#a9b4bd',
    'editorLineNumber.activeForeground': '#41505c',
    'editorCursor.foreground': '#1f5c8b',
    'editor.selectionBackground': '#cfe1ef',
    'editor.lineHighlightBackground': '#f0f3f6',
    'editorIndentGuide.background1': '#e3e8ec',
    'editorIndentGuide.activeBackground1': '#b6c3ce',
    'editorWhitespace.foreground': '#d5dce1',
    'editorGutter.background': '#fbfcfd',
    'editorError.foreground': '#a3283b',
    'editorWarning.foreground': '#8a6216',
    'minimap.background': '#f6f8f9',
    'scrollbarSlider.background': '#c8d0d780',
    'editorWidget.background': '#f5f7f8',
    'editorWidget.border': '#c8d0d7',
    'focusBorder': '#1f5c8b',
  },
});

export default monaco;
