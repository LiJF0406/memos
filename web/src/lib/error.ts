export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  // Connect RPC 错误优先取 rawMessage，避免展示 "[invalid_argument]" 这类技术前缀
  if (error && typeof error === "object" && "rawMessage" in error) {
    const raw = (error as { rawMessage?: unknown }).rawMessage;
    // 仅当确实是非空字符串时才使用，避免 "null"/"undefined" 被当作有效消息
    if (typeof raw === "string" && raw) {
      return raw;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return fallback;
}

export function handleError(
  error: unknown,
  toast: (message: string) => void,
  options?: {
    context?: string;
    fallbackMessage?: string;
    onError?: (error: unknown) => void;
  },
): void {
  const contextPrefix = options?.context ? `${options.context}: ` : "";
  const fallback = options?.fallbackMessage;

  const errorMessage = options?.context ? `${contextPrefix}${getErrorMessage(error, fallback)}` : getErrorMessage(error, fallback);

  console.error(error);
  toast(errorMessage);
  options?.onError?.(error);
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
