/** A set of listeners for one value: `subscribe` returns the unsubscribe. */
export function createListeners<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    emit(value: T) {
      for (const listener of listeners) listener(value);
    },
  };
}
