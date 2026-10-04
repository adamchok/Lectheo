'use client'

import type { SourceRef } from '@lectheo/contracts'
import { createContext, useContext, type ReactNode } from 'react'

export interface PlayerContextValue {
  /** Seek the active YouTube / local player. `null` when no player is mounted. */
  seek: ((ms: number) => void) | null
  /** Open the transcript side panel at a source. `null` when no panel is available. */
  openTranscript: ((source: SourceRef) => void) | null
}

const PlayerContext = createContext<PlayerContextValue>({ seek: null, openTranscript: null })

/**
 * Watch mode (TODO(feature-watch-mode)) wraps its page in this provider so every
 * <SourceRef> on the page can seek the player.
 */
export function PlayerProvider({
  value,
  children,
}: {
  value: PlayerContextValue
  children: ReactNode
}) {
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerContextValue {
  return useContext(PlayerContext)
}
