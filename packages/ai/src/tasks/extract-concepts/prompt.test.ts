import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildPrompt } from './prompt'
import { ExtractConceptsOutput, type ExtractConceptsInput } from './schema'

const input = (chapterCount: ExtractConceptsInput['chapterCount']): ExtractConceptsInput => ({
  lectureTitle: 'L',
  segments: [{ idx: 0, text: 'A pointer stores an address.' }],
  existingConcepts: [],
  targetCount: 3,
  chapterCount,
})

describe('extract-concepts prompt (F11.2)', () => {
  it('asks for the chapter count when the lecture has timestamps', () => {
    expect(buildPrompt(input({ min: 8, max: 16 })).prompt).toContain('8 to 16 chapters')
  })

  it('asks for no chapters without timestamps', () => {
    expect(buildPrompt(input(null)).prompt).toContain('Chapters: not wanted')
    expect(buildPrompt(input(undefined)).prompt).toContain('Chapters: not wanted')
  })
})

describe('extract-concepts output schema', () => {
  it('drops a malformed chapter list instead of failing the extraction', () => {
    const out = ExtractConceptsOutput.parse({
      concepts: [],
      edges: [],
      chapters: [{ title: 'No start' }],
    })
    expect(out.chapters).toEqual([])
  })

  it('still converts to a JSON schema for structured output', () => {
    expect(() => z.toJSONSchema(ExtractConceptsOutput, { io: 'input' })).not.toThrow()
  })
})
