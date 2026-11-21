import { create } from 'zustand'

// 공통 runtime이 React 화면과 자신을 다시 import하지 않도록 순수 상태만 노출한다.
export const useYut = create(() => ({ open: false }))
export const requestYut = () => useYut.setState({ open: true })
