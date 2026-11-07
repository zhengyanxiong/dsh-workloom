/** Navigation labels for Loom hash routes shared by the top bar and palette. */
import type { LoomKey } from '../locales.ts'
import type { LoomRoute } from './router.ts'

export const ROUTE_LABEL: Readonly<Record<LoomRoute, LoomKey>> = {
  home: 'nav.overview',
  board: 'view.kanban',
  task: 'nav.tasks',
  session: 'sessions',
  project: 'nav.projects',
  settings: 'nav.settings',
}
