export interface ChatInputProps {
    placeholder?: string;
}
export interface ArrowKeyDownPayload {
    key: 'ArrowUp' | 'ArrowDown';
    currentInputValue: string;
}
export interface EscapeKeyDownPayload {
    currentInputValue: string;
}
declare function __VLS_template(): {
    attrs: Partial<{}>;
    slots: {
        leftPanel?(_: {}): any;
    };
    refs: {
        chatTextArea: HTMLTextAreaElement;
    };
    rootEl: HTMLDivElement;
};
type __VLS_TemplateResult = ReturnType<typeof __VLS_template>;
declare const __VLS_component: import('vue').DefineComponent<ChatInputProps, {}, {}, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {
    arrowKeyDown: (value: ArrowKeyDownPayload) => any;
    escapeKeyDown: (value: EscapeKeyDownPayload) => any;
}, string, import('vue').PublicProps, Readonly<ChatInputProps> & Readonly<{
    onArrowKeyDown?: ((value: ArrowKeyDownPayload) => any) | undefined;
    onEscapeKeyDown?: ((value: EscapeKeyDownPayload) => any) | undefined;
}>, {
    placeholder: string;
}, {}, {}, {}, string, import('vue').ComponentProvideOptions, false, {
    chatTextArea: HTMLTextAreaElement;
}, HTMLDivElement>;
declare const _default: __VLS_WithTemplateSlots<typeof __VLS_component, __VLS_TemplateResult["slots"]>;
export default _default;
type __VLS_WithTemplateSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
