export * from '../features/notifications/api'
export async function loadNotifications(_cursor:string,signal:AbortSignal){signal.throwIfAborted();return {items:[],nextCursor:null,unreadCount:0}}
