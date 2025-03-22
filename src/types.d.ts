type KeysWithValsOfType<T, V> = keyof {
  [P in keyof T as T[P] extends V ? P : never]: P
}

declare namespace svelteHTML {
  interface HTMLAttributes<T> {
    onintersect?: EventHandler<CustomEvent<IntersectionObserverEntry>, T>
  }
}
