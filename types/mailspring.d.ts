// Hand-written declarations for the slice of Mailspring's plugin API this plugin uses. The app's
// own .d.ts files import from its source tree, so they can't be consumed outside a checkout.

declare module 'mailspring-exports' {
  import * as ReactModule from 'react';

  export const React: typeof ReactModule;
  export const ReactDOM: { findDOMNode(instance: any): Element | Text | null };

  export function localized(en: string, ...subs: unknown[]): string;

  export class Model {
    id: string;
    accountId: string;
  }

  export class File extends Model {
    filename: string;
    contentType: string;
  }

  export class Message extends Model {
    subject: string;
    body?: string;
    plaintext: boolean;
    draft: boolean;
    date: Date;
    files: File[];
  }

  export class Calendar extends Model {
    name: string;
    color?: string;
    readOnly: boolean;
  }

  export class Event extends Model {
    constructor(data: {
      calendarId: string;
      accountId: string;
      ics: string;
      icsuid: string;
      recurrenceStart: number;
      recurrenceEnd: number;
    });
    title: string;
    recurrenceStart: number;
  }

  export class Task extends Model {
    error?: any;
  }

  export const SyncbackEventTask: {
    forCreating(opts: { event: Event; calendarId: string; accountId: string }): Task;
  };

  export const TaskQueue: {
    waitForPerformRemote(task: Task): Promise<Task>;
  };

  export const ICSEventHelpers: {
    generateUID(): string;
    createICSString(opts: {
      uid?: string;
      summary: string;
      description?: string;
      location?: string;
      start: Date;
      end: Date;
      isAllDay?: boolean;
      timezone?: string;
    }): string;
  };

  export const DateUtils: {
    timeZone: string;
  };

  export const QuotedHTMLTransformer: {
    removeQuotedHTML(html: string, options?: { keepIfWholeBodyIsQuote: boolean }): string;
  };

  export const DatabaseStore: {
    findAll<T extends Model>(klass: new (...args: any[]) => T): PromiseLike<T[]>;
  };

  export const ComponentRegistry: {
    register(component: any, options: { role?: string; location?: { id: string } }): void;
    unregister(component: any): void;
  };

  export const Actions: {
    queueTask(task: Task): void;
    openPopover(element: ReactModule.ReactElement, opts: { originRect: DOMRect; direction: string }): void;
    closePopover(): void;
  };
}

declare module 'mailspring-component-kit' {
  import * as ReactModule from 'react';

  export const RetinaImg: ReactModule.ComponentType<{
    name?: string;
    mode: string;
    style?: ReactModule.CSSProperties;
    'aria-hidden'?: boolean | 'true' | 'false';
  }> & { Mode: { ContentIsMask: string; ContentPreserve: string } };
}

declare module 'electron' {
  export const ipcRenderer: {
    send(channel: string, ...args: unknown[]): void;
  };
}

declare const AppEnv: {
  config: {
    get(key: string): any;
  };
  showErrorDialog(message: string): void;
};
