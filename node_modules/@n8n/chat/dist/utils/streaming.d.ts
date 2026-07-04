import { ChatMessage, ChatMessageText } from '../types';
export interface NodeRunData {
    content: string;
    isComplete: boolean;
    message: ChatMessageText;
}
export declare class StreamingMessageManager {
    private nodeRuns;
    private runOrder;
    private activeRuns;
    constructor();
    private getRunKey;
    initializeRun(nodeId: string, runIndex?: number): ChatMessageText;
    registerRunStart(nodeId: string, runIndex?: number): void;
    addRunToActive(nodeId: string, runIndex?: number): ChatMessageText;
    removeRunFromActive(nodeId: string, runIndex?: number): void;
    addChunkToRun(nodeId: string, chunk: string, runIndex?: number): ChatMessageText | null;
    getRunMessage(nodeId: string, runIndex?: number): ChatMessageText | null;
    areAllRunsComplete(): boolean;
    getRunCount(): number;
    getActiveRunCount(): number;
    getAllMessages(): ChatMessageText[];
    reset(): void;
}
export declare function createBotMessage(id?: string): ChatMessageText;
export declare function updateMessageInArray(messages: ChatMessage[], messageId: string, updatedMessage: ChatMessageText): void;
