import { Ref } from 'vue';
import { ChatMessage, ChatMessageText } from '../types';
import { StreamingMessageManager } from './streaming';
export declare function handleStreamingChunk(chunk: string, nodeId: string | undefined, streamingManager: StreamingMessageManager, receivedMessage: Ref<ChatMessageText | null>, messages: Ref<ChatMessage[]>, runIndex?: number): void;
export declare function handleNodeStart(nodeId: string, streamingManager: StreamingMessageManager, runIndex?: number): void;
export declare function handleNodeComplete(nodeId: string, streamingManager: StreamingMessageManager, runIndex?: number): void;
