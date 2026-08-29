// Repository singletons for the V1 local runtime. UI code imports these (or
// receives their results via useWorldContent) and never touches content JSON.

import { createLocalContentRepositories } from './localContentRepositories'
import { createLocalMediaRepository } from './localMediaRepository'

const localContent = createLocalContentRepositories()

export const worldRepository = localContent.world
export const placeRepository = localContent.places
export const visitRepository = localContent.visits
export const memoryRepository = localContent.memories
export const mediaRepository = createLocalMediaRepository()
