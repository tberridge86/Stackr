declare module 'jpeg-js' {
  export function encode(
    image: { width: number; height: number; data: Uint8Array | ArrayLike<number> },
    quality?: number
  ): { width: number; height: number; data: Uint8Array };

  export function decode(
    data: Uint8Array,
    options?: { useTArray?: boolean }
  ): { width: number; height: number; data: Uint8Array };
}
