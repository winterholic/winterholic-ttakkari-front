declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, channel: string | WebSocket, options?: { credentials?: { username?: string; password?: string }; shared?: boolean });
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    focusOnClick: boolean;
    showDotCursor: boolean;
    qualityLevel: number;
    compressionLevel: number;
    disconnect(): void;
    blur(): void;
    focus(): void;
    sendKey(keysym: number, code?: string, down?: boolean): void;
    clipboardPasteFrom(text: string): void;
    sendCredentials(credentials: { username?: string; password?: string }): void;
  }
}
