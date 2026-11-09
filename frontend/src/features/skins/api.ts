import { InboxError, inboxRequest } from '../notifications/api'

export const skinRoot = '/api/v1/admin/operations/skins'
export const slotOrder = ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'] as const
export type SkinSlot = typeof slotOrder[number]
export interface SkinDefinition { productCode: string; name: string; grade: number; compatibility: 'MALE' | 'FEMALE' | 'ANY'; wearMode: 'WHOLE' | 'PARTS'; slots: SkinSlot[] }
export interface SkinEntry { id: string; definition: SkinDefinition; state: 'DRAFT' | 'PUBLISHED' | 'DISABLED'; version: number; publishedUploadId: string | null; updatedAt: string }
export interface SkinSettings { storageReady: boolean; maxModelBytes: number; maxImageBytes: number; urlTtlSeconds: number }
export interface SkinTarget { url: string; headers: Record<string, string> }
export interface SkinTicket { uploadId: string; expiresAt: string; model: SkinTarget; image: SkinTarget; femaleModel?: SkinTarget | null }
export interface SkinVerified { uploadId: string; modelUrl: string; imageUrl: string; femaleModelUrl?: string | null; maleModelId?: string | null; femaleModelId?: string | null }
export interface SkinAsset extends Omit<SkinVerified, 'uploadId'> { imageKey: string; productCode: string; name: string; grade: number; compatibility: SkinDefinition['compatibility']; wearMode: SkinDefinition['wearMode']; slots: SkinSlot[] }

export async function skinRequest<T>(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  try { return await inboxRequest(skinRoot + path, signal, method, body) as T }
  catch (cause) {
    if (!(cause instanceof InboxError)) throw cause
    const messages: Record<string, string> = {
      SKIN_SET_SLOT_CONFLICT: '이미 사용 중인 부위예요. 기존 아이템을 먼저 빼주세요.',
      SKIN_SET_IMMUTABLE: '공개한 세트 구성은 바꿀 수 없어요. 새 세트로 등록해주세요.',
      SKIN_ITEM_NOT_READY: '구성 아이템을 먼저 검증·공개해주세요.',
      SKIN_SET_CHARACTER_MISMATCH: '세트와 아이템의 착용 캐릭터가 다릅니다.',
      SKIN_VERSION_CHANGED: '다른 창에서 변경됐어요. 목록을 다시 불러온 뒤 확인해주세요.',
      SKIN_ACCESS_DENIED: '스킨 등록 담당자로 지정된 운영 관리자만 사용할 수 있어요.',
      SKIN_STORAGE_UNAVAILABLE: 'S3·CDN 연결을 확인하지 못했어요. 입력은 유지했어요.',
      SKIN_REGISTRATION_UNAVAILABLE: '스킨 등록 DB 연결이 필요해요. 결과는 목록에서 다시 확인해주세요.',
      SKIN_CODE_EXISTS: '이미 등록된 상품 코드예요. 목록에서 기존 등록을 확인해주세요.',
      SKIN_PRODUCT_CODE_CONFLICT: '기존 상품이 사용하는 코드예요. 새 상품 코드를 사용해주세요.',
      SKIN_NOT_VERIFIED: '파일 검증을 먼저 완료해주세요.',
      SKIN_UPLOAD_INCOMPLETE: '선택한 파일 업로드가 완료되지 않았어요. 파일을 다시 업로드해주세요.',
      SKIN_NOT_FOUND: '등록한 스킨을 찾지 못했어요. 목록을 다시 조회해주세요.',
      SKIN_UPLOAD_NOT_FOUND: '업로드한 파일 버전을 찾지 못했어요.',
      SKIN_INVALID_REQUEST: '상품 입력값과 파일 규격을 확인해주세요. 모델 뼈대·LOD·부위 이름도 OnTop 규격이어야 해요.',
      SKIN_PUBLISHED_DEFINITION_IMMUTABLE: '공개한 상품의 등급·호환·구성은 새 상품으로 등록해주세요.',
    }
    throw new InboxError(messages[cause.code] ?? cause.message, cause.status, cause.code)
  }
}

export async function fileSpec(file: File, extension: '.glb' | '.webp', limit: number) {
  if (!file.name.toLowerCase().endsWith(extension) || file.size < (extension === '.glb' ? 20 : 12) || file.size > limit)
    throw new Error(`${extension} 파일은 ${Math.round(limit / 1024 / 1024)}MiB 이하로 선택해주세요.`)
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return { name: file.name, bytes: file.size, sha256: [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('') }
}
/** S3 요청에는 로그인 토큰·쿠키를 보내지 않는다. 서명된 헤더와 실제 파일만 전송한다. */
export async function uploadFile(target: SkinTarget, file: File, signal: AbortSignal) {
  const url = new URL(target.url)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('업로드 주소를 확인하지 못했어요.')
  const response = await fetch(target.url, { method: 'PUT', credentials: 'omit', headers: target.headers,
    body: file, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) })
  if (!response.ok) throw new Error('업로드하지 못했어요. 권한·URL 유효 시간을 확인하고 새 URL로 다시 시도해주세요.')
}


/** Infer file organization, not the occupied slots. Full-slot PARTS files remain independently wearable. */
export async function skinModelMode(file: File): Promise<SkinDefinition['wearMode']> {
  if (file.size < 20 || file.size > 20971520) throw new Error('GLB는 20MiB 이하의 파일을 선택해주세요.')
  const bytes = await file.arrayBuffer(), view = new DataView(bytes)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('GLB 2.0 파일을 선택해주세요.')
  const length = view.getUint32(12, true)
  if (length > bytes.byteLength - 20) throw new Error('GLB 파일을 읽지 못했어요.')
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)))
  const nodes: unknown[] = [...(Array.isArray(json.nodes) ? json.nodes : []), ...(Array.isArray(json.meshes) ? json.meshes : [])]
  const names = nodes.flatMap(node => {
    const value = node as { extras?: { pieces?: unknown[] } }
    return Array.isArray(value.extras?.pieces) ? value.extras.pieces.filter((p): p is unknown[] => Array.isArray(p)).map(p => p[0]).filter((v): v is string => typeof v === 'string') : []
  })
  // Base/full-body GLBs can also contain item ranges. Body ranges distinguish them from outfit-only files.
  const parts = !names.some(name => /^body(?:__|$)/.test(name)) && names.some(name => name.startsWith('item__'))
  return parts ? 'PARTS' : 'WHOLE'
}
