import { ChatMessage } from '../types';
type __VLS_Props = {
    message: ChatMessage;
};
declare function __VLS_template(): {
    attrs: Partial<{}>;
    slots: Readonly<{
        beforeMessage(props: {
            message: ChatMessage;
        }): ChatMessage;
        default: {
            message: ChatMessage;
        };
    }> & {
        beforeMessage(props: {
            message: ChatMessage;
        }): ChatMessage;
        default: {
            message: ChatMessage;
        };
    };
    refs: {
        messageContainer: HTMLDivElement;
    };
    rootEl: HTMLDivElement;
};
type __VLS_TemplateResult = ReturnType<typeof __VLS_template>;
declare const __VLS_component: import('vue').DefineComponent<__VLS_Props, {
    scrollToView: () => void;
}, {}, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {}, string, import('vue').PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import('vue').ComponentProvideOptions, false, {
    messageContainer: HTMLDivElement;
}, HTMLDivElement>;
declare const _default: __VLS_WithTemplateSlots<typeof __VLS_component, __VLS_TemplateResult["slots"]>;
export default _default;
type __VLS_WithTemplateSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
