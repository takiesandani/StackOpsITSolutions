import { ChatOptions, LoadPreviousSessionResponse, SendMessageResponse } from '../types';
export declare function loadPreviousSession(sessionId: string, options: ChatOptions): Promise<LoadPreviousSessionResponse>;
export declare function sendMessage(message: string, files: File[], sessionId: string, options: ChatOptions): Promise<SendMessageResponse>;
export interface StreamingEventHandlers {
    onBeginMessage: (nodeId: string, runIndex?: number) => void;
    onChunk: (chunk: string, nodeId?: string, runIndex?: number) => void;
    onEndMessage: (nodeId: string, runIndex?: number) => void;
}
export declare function sendMessageStreaming(message: string, files: File[], sessionId: string, options: ChatOptions, handlers: StreamingEventHandlers): Promise<{
    hasReceivedChunks: boolean;
}>;
