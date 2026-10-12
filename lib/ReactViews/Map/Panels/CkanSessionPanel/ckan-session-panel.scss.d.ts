declare namespace CkanSessionPanelScssNamespace {
  export interface ICkanSessionPanelScss {
    btn: string;
    userName: string;
  }
}

declare const CkanSessionPanelScssModule: CkanSessionPanelScssNamespace.ICkanSessionPanelScss & {
  /** WARNING: Only available when `css-loader` is used without `style-loader` or `mini-css-extract-plugin` */
  locals: CkanSessionPanelScssNamespace.ICkanSessionPanelScss;
};

export = CkanSessionPanelScssModule;
