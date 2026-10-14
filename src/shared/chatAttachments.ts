import type { ChatImage } from './chatImages'
export type ChatFile = { kind:'file'|'video'|'folder';path:string;name:string;size:number;note?:string;thumbnail?:string }
export type ChatAttachment = (ChatImage & {kind:'image';size:number}) | ChatFile
