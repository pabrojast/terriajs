declare namespace StoryEditorScssNamespace {
  export interface IStoryEditorScss {
    actions: string;
    body: string;
    cardActions: string;
    checkLabel: string;
    choice: string;
    classicNote: string;
    closeButton: string;
    contentHeading: string;
    contentPane: string;
    control: string;
    controlGrid: string;
    dialogBody: string;
    dialogHeader: string;
    discardBackdrop: string;
    discardDialog: string;
    error: string;
    eyebrow: string;
    feedback: string;
    focusGuard: string;
    footer: string;
    formatChoices: string;
    header: string;
    hint: string;
    inner: string;
    "is-mounted": string;
    isMounted: string;
    label: string;
    layoutPreview: string;
    loading: string;
    pickerDialog: string;
    popupEditor: string;
    previewText: string;
    previewVisual: string;
    primaryButton: string;
    required: string;
    resourceBadge: string;
    resourceBody: string;
    resourceCard: string;
    resourceDialog: string;
    resourceIdentity: string;
    resourceList: string;
    resourceSection: string;
    secondaryButton: string;
    section: string;
    settingsPane: string;
    templateChoices: string;
    titleInput: string;
    urlForm: string;
    workspace: string;
  }
}

declare const StoryEditorScssModule: StoryEditorScssNamespace.IStoryEditorScss & {
  /** WARNING: Only available when `css-loader` is used without `style-loader` or `mini-css-extract-plugin` */
  locals: StoryEditorScssNamespace.IStoryEditorScss;
};

export = StoryEditorScssModule;
