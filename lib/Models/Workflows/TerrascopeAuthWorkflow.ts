import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction
} from "mobx";
import Icon from "../../Styled/Icon";
import { BaseModel } from "../Definition/Model";
import {
  SelectableDimensionButton,
  SelectableDimensionText
} from "../SelectableDimensions/SelectableDimensions";
import SelectableDimensionWorkflow, {
  SelectableDimensionWorkflowGroup
} from "./SelectableDimensionWorkflow";

export interface TerrascopeAuthCredentials {
  username: string;
  password: string;
}

export interface TerrascopeAuthWorkflowCallbacks {
  connect(credentials: TerrascopeAuthCredentials): Promise<void>;
  clear(): Promise<void> | void;
  isAuthenticated(): boolean;
  getCurrentUsername?(): string | undefined;
}

/**
 * Generic workflow for collecting Terrascope credentials without coupling the
 * UI layer to a specific catalog item or auth manager implementation.
 */
export default class TerrascopeAuthWorkflow
  implements SelectableDimensionWorkflow
{
  static readonly type = "terrascope-auth";

  @observable
  private username = "";

  @observable
  private password = "";

  @observable
  private isSubmitting = false;

  constructor(
    readonly item: BaseModel,
    private readonly callbacks: TerrascopeAuthWorkflowCallbacks
  ) {
    makeObservable(this);

    const currentUsername = this.callbacks.getCurrentUsername?.();
    if (currentUsername) {
      this.username = currentUsername;
    }
  }

  get name() {
    return "Terrascope Login";
  }

  get icon() {
    return Icon.GLYPHS.lock;
  }

  @computed
  get footer() {
    return {
      buttonText: this.isSubmitting ? "Connecting..." : "Connect",
      onClick: this.connect
    };
  }

  get menu() {
    return undefined;
  }

  @computed
  get selectableDimensions(): SelectableDimensionWorkflowGroup[] {
    return [
      {
        type: "group",
        id: "terrascope-auth",
        name: this.callbacks.isAuthenticated() ? "Session" : "Credentials",
        selectableDimensions: [
          this.usernameSelectableDim,
          this.passwordSelectableDim,
          this.clearSessionButton
        ],
        isOpen: true
      }
    ];
  }

  @computed
  private get usernameSelectableDim(): SelectableDimensionText {
    return {
      type: "text",
      id: "username",
      name: "Username",
      value: this.username,
      inputType: "text",
      setDimensionValue: (_stratumId: string, value: string | undefined) => {
        this.username = value ?? "";
      }
    };
  }

  @computed
  private get passwordSelectableDim(): SelectableDimensionText {
    return {
      type: "text",
      id: "password",
      name: "Password",
      value: this.password,
      inputType: "password",
      setDimensionValue: (_stratumId: string, value: string | undefined) => {
        this.password = value ?? "";
      }
    };
  }

  @computed
  private get clearSessionButton(): SelectableDimensionButton {
    return {
      type: "button",
      id: "clear-session",
      name: "Session",
      value: this.callbacks.isAuthenticated()
        ? "Clear stored session"
        : "No stored session",
      icon: this.isSubmitting ? "spinner" : Icon.GLYPHS.close,
      disable: this.isSubmitting || !this.callbacks.isAuthenticated(),
      setDimensionValue: this.clear
    };
  }

  @action.bound
  private async connect() {
    if (this.isSubmitting) {
      return;
    }

    const username = this.username.trim();
    const password = this.password;
    if (username.length === 0 || password.length === 0) {
      return;
    }

    this.isSubmitting = true;
    try {
      await this.callbacks.connect({ username, password });
      runInAction(() => {
        this.username = username;
        this.password = "";
      });
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }

  @action.bound
  private async clear() {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    try {
      await this.callbacks.clear();
      runInAction(() => {
        this.password = "";
      });
    } finally {
      runInAction(() => {
        this.isSubmitting = false;
      });
    }
  }
}
