export const SOLO_PAGE: string;
export const SBS_STREAM_API: string;
import type {SbsCatalogEntry} from './sbs-catalog.mjs';
export function getSbsChannel(channel:{url:string}):SbsCatalogEntry|undefined;
export function validateSbsStream(value: string,expected?:{channel:string;stream:string}): string;
export function resolvePlaybackSource(channel:{kind:string;url:string},options?:{fetcher?:typeof fetch;signal?:AbortSignal}):Promise<string>;
