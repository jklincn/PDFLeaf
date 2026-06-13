declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }

  interface URLConstructor {
    parse(url: string | URL, base?: string | URL): URL | null;
  }
}

if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });

    return { promise, resolve, reject };
  };
}

if (!URL.parse) {
  URL.parse = function parse(url: string | URL, base?: string | URL) {
    try {
      return base === undefined ? new URL(url) : new URL(url, base);
    } catch {
      return null;
    }
  };
}

export {};
