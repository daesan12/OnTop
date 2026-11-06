import type { CoopRoom } from './contracts'

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '')

export function searchCoopRooms(rooms: CoopRoom[], query: string): CoopRoom[] {
  const words = query.normalize('NFKC').trim().split(/\s+/).map(normalize).filter(Boolean)
  if (!words.length) return rooms
  return rooms.filter(room => {
    const name = normalize(room.roomName), host = normalize(room.hostNickname)
    return words.every(word => name.includes(word) || host.includes(word))
  })
}
