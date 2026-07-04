type __VLS_Props = {
    file: File;
    isRemovable: boolean;
    isPreviewable?: boolean;
    href?: string;
};
declare const _default: import('vue').DefineComponent<__VLS_Props, {}, {}, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {
    remove: (value: File) => any;
}, string, import('vue').PublicProps, Readonly<__VLS_Props> & Readonly<{
    onRemove?: ((value: File) => any) | undefined;
}>, {}, {}, {}, {}, string, import('vue').ComponentProvideOptions, false, {}, HTMLDivElement>;
export default _default;
