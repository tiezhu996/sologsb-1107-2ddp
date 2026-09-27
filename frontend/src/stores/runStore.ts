import { create } from 'zustand'
import type { SheetRun, SheetRunInput } from '../types/sheet-run'
import { db, plain } from '../utils/db'
import { calculateDeviation } from '../utils/stripe'

interface RunStore {
  sheetRuns: SheetRun[]
  isLoading: boolean
  loaded: boolean
  error: string | null
  loadRuns: () => Promise<void>
  addRun: (input: SheetRunInput) => Promise<SheetRun | null>
  updateMeasuredGap: (id: number, measuredGap: number) => Promise<void>
}

export const useRunStore = create<RunStore>((set, get) => ({
  sheetRuns: [],
  isLoading: false,
  loaded: false,
  error: null,
  loadRuns: async () => {
    if (get().loaded) return
    set({ isLoading: true, error: null })
    try {
      const sheetRuns = await db.sheetRuns.orderBy('runDate').reverse().toArray()
      set({ sheetRuns, isLoading: false, loaded: true })
    } catch {
      set({ isLoading: false, error: '抄纸工序读取失败，请检查浏览器存储权限' })
    }
  },
  addRun: async (input) => {
    set({ error: null })
    try {
      // 偏差按登记当时的纸帘标准间距固化，不再随纸帘之后的调整而变化
      const payload = plain({ ...input, deviation: calculateDeviation(input.measuredGap, input.standardGap) })
      const id = Number(await db.sheetRuns.add(payload))
      const created: SheetRun = { ...payload, id, schemaRev: 3 }
      set((state) => ({ sheetRuns: [created, ...state.sheetRuns] }))
      return created
    } catch {
      set({ error: '工序登记失败，请检查工序编号是否重复' })
      return null
    }
  },
  updateMeasuredGap: async (id, measuredGap) => {
    const existing = get().sheetRuns.find((run) => run.id === id)
    // 复测只换实测值，标准间距沿用本槽登记时的快照
    const standardGap = existing?.standardGap ?? measuredGap
    const deviation = calculateDeviation(measuredGap, standardGap)
    try {
      await db.sheetRuns.update(id, { measuredGap, standardGap, deviation, schemaRev: 3 })
      set((state) => ({
        sheetRuns: state.sheetRuns.map((run) => (run.id === id ? { ...run, measuredGap, standardGap, deviation, schemaRev: 3 } : run)),
        error: null,
      }))
    } catch {
      set({ error: '实测间距更新失败' })
    }
  },
}))
