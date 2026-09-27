import { create } from 'zustand'
import type { Mould, MouldInput, MouldStateValue } from '../types/mould'
import { db, plain } from '../utils/db'
import { calculateMeshDensity } from '../utils/stripe'

interface MouldStore {
  moulds: Mould[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadMoulds: () => Promise<void>
  addMould: (input: MouldInput) => Promise<Mould | null>
  setMouldState: (id: number, state: MouldStateValue) => Promise<void>
  updateStripeGap: (id: number, stripeGap: number) => Promise<Mould | null>
}

export const useMouldStore = create<MouldStore>((set, get) => ({
  moulds: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadMoulds: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const moulds = await db.moulds.orderBy('mouldNo').toArray()
      set({ moulds, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '纸帘台帐读取失败，请检查浏览器存储权限' })
    }
  },
  addMould: async (input) => {
    set({ error: null })
    try {
      const payload = plain(input)
      const id = Number(await db.moulds.add(payload))
      const created: Mould = { ...payload, id, schemaRev: 2 }
      set((state) => ({ moulds: [created, ...state.moulds] }))
      return created
    } catch {
      set({ error: '纸帘登记失败，请检查编号是否重复' })
      return null
    }
  },
  setMouldState: async (id, nextState) => {
    try {
      await db.moulds.update(id, { state: nextState, schemaRev: 2 })
      set((state) => ({
        moulds: state.moulds.map((mould) => (mould.id === id ? { ...mould, state: nextState, schemaRev: 2 } : mould)),
        error: null,
      }))
    } catch {
      set({ error: '纸帘状态更新失败' })
    }
  },
  updateStripeGap: async (id, stripeGap) => {
    try {
      const mould = get().moulds.find((item) => item.id === id) ?? (await db.moulds.get(id))
      if (!mould) throw new Error('mould missing')
      const meshDensity = calculateMeshDensity(mould.wireDiameter, stripeGap)
      await db.moulds.update(id, { stripeGap, meshDensity })
      const updated: Mould = { ...mould, stripeGap, meshDensity }
      set((state) => ({
        moulds: state.moulds.map((item) => (item.id === id ? updated : item)),
        error: null,
      }))
      return updated
    } catch {
      set({ error: '帘纹间距更新失败' })
      return null
    }
  },
}))
