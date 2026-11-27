export const SOLO_PAGE: string;
export const SBS_STREAM_API: string;
export function validateSbsStream(value: string): string;
export function resolvePlaybackSource(channel:{kind:string;url:string},options?:{fetcher?:typeof fetch;signal?:AbortSignal}):Promise<string>;
