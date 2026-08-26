import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SIDECAR_NAME,
  ensureResultsIgnored,
  executionDirectory,
  replaceManagedBlock,
  taskSegment,
  writeSidecar,
} from '@rheplicant/dsh-rheplicant/project'

/** A fresh directory that looks like a git working tree. */
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'rheplicant-project-'))
  mkdirSync(join(root, '.git'))
  return root
}

let workspace: string
beforeEach(() => { workspace = repository() })

describe('taskSegment', () => {
  it('keeps the task\'s relative path and drops only its extension', () => {
    expect(taskSegment(workspace, join(workspace, 'tasks', 'demo_small.yaml')))
      .toBe(join('tasks', 'demo_small'))
    expect(taskSegment(workspace, join(workspace, 'demo.yaml'))).toBe('demo')
  })

  it('keeps two same-named tasks in different directories apart', () => {
    // Collapsing to a basename would file their executions together and make
    // the tree lie about which document produced what.
    expect(taskSegment(workspace, join(workspace, 'a', 'demo.yaml')))
      .not.toBe(taskSegment(workspace, join(workspace, 'b', 'demo.yaml')))
  })

  it('does not mistake a dot in a DIRECTORY name for an extension', () => {
    expect(taskSegment(workspace, join(workspace, 'a.b', 'c'))).toBe(join('a.b', 'c'))
  })
})

describe('executionDirectory', () => {
  it('places one execution under results/<task>/<id>', () => {
    expect(executionDirectory(workspace, join(workspace, 'tasks', 'a.yaml'), 'EXEC-1'))
      .toBe(join(workspace, 'results', 'tasks', 'a', 'EXEC-1'))
  })
})

describe('ensureResultsIgnored', () => {
  it('adds a managed block without disturbing what the user wrote', () => {
    writeFileSync(join(workspace, '.gitignore'), 'node_modules/\n', 'utf8')
    expect(ensureResultsIgnored(workspace)).toBe(join(workspace, '.gitignore'))
    const body = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(body.startsWith('node_modules/\n')).toBe(true)
    expect(body).toContain('/results/')
  })

  it('creates the file when the project has none', () => {
    expect(ensureResultsIgnored(workspace)).toBe(join(workspace, '.gitignore'))
    expect(readFileSync(join(workspace, '.gitignore'), 'utf8')).toContain('/results/')
  })

  it('writes the block for a project NESTED inside a repository', () => {
    // Measured 2026-08-23, in the first real end-to-end run: `harness/` is a
    // project inside this repo and has no `.git` of its own, so the check
    // answered "not a repository" and the block was never written. Its
    // published tree then showed up as untracked in the parent repo — which
    // is the exact thing §9 decided to prevent. A project directory is very
    // rarely a repository ROOT.
    const nested = join(workspace, 'sub', 'project')
    mkdirSync(nested, { recursive: true })

    expect(ensureResultsIgnored(nested)).toBe(join(nested, '.gitignore'))
    // Written into the PROJECT's own .gitignore, not the repository root's:
    // git honours a nested .gitignore, `results/` is this project's concern,
    // and rewriting a file the project does not own would be a surprise.
    expect(readFileSync(join(nested, '.gitignore'), 'utf8')).toContain('/results/')
  })

  it('still writes nothing for a project outside any repository', () => {
    // The documented no-op, and the reason the check exists at all: a
    // .gitignore in a directory git will never read is litter.
    const loose = mkdtempSync(join(tmpdir(), 'rheplicant-loose-'))
    expect(ensureResultsIgnored(loose)).toBeUndefined()
    expect(existsSync(join(loose, '.gitignore'))).toBe(false)
  })

  it('is idempotent, so a second execution announces nothing and duplicates nothing', () => {
    ensureResultsIgnored(workspace)
    const after = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(ensureResultsIgnored(workspace)).toBeUndefined()
    expect(readFileSync(join(workspace, '.gitignore'), 'utf8')).toBe(after)
  })

  it('ignores the state directory too, not only the execution trees', () => {
    // The trigger registry lives there. Without this line a schedule turns up
    // as untracked source in the next `git status` — this layer littering in a
    // repository it does not own.
    ensureResultsIgnored(workspace)
    expect(readFileSync(join(workspace, '.gitignore'), 'utf8')).toContain('/.rheplicant-agent/')
  })

  it('REWRITES a block an older version wrote, which is why the block is versionless', () => {
    // The original returned the moment the START marker appeared anywhere, so
    // a block written before the state directory existed would have kept
    // ignoring only `results/` forever — while its own text promised "the block
    // is rewritten". The behaviour now matches the promise.
    const stale = [
      'node_modules/',
      '# >>> rheplicant-agent (managed) >>>',
      '# an older comment nobody will read again',
      '/results/',
      '# <<< rheplicant-agent (managed) <<<',
      'coverage/',
      '',
    ].join('\n')
    writeFileSync(join(workspace, '.gitignore'), stale, 'utf8')

    expect(ensureResultsIgnored(workspace)).toBe(join(workspace, '.gitignore'))

    const body = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(body).toContain('/.rheplicant-agent/')
    expect(body).not.toContain('an older comment nobody will read again')
    // Everything outside the markers survives, on both sides.
    expect(body.startsWith('node_modules/\n')).toBe(true)
    expect(body).toContain('coverage/')
    // Exactly one block, not a second appended beside the old one.
    expect(body.split('# >>> rheplicant-agent (managed) >>>')).toHaveLength(2)
  })

  it('does nothing at all outside a git repository', () => {
    const plain = mkdtempSync(join(tmpdir(), 'rheplicant-plain-'))
    expect(ensureResultsIgnored(plain)).toBeUndefined()
    expect(existsSync(join(plain, '.gitignore'))).toBe(false)
  })
})

describe('writeSidecar', () => {
  const facts = {
    executionId: 'EXEC-1',
    task: 'tasks/a',
    taskPath: '/w/tasks/a.yaml',
    taskDigest: 'abc',
    transport: 'local',
    startedAt: '2026-08-22T19:00:00.000Z',
    finishedAt: '2026-08-22T19:00:02.000Z',
  }

  it('records the one fact upstream does not: which session produced this', () => {
    const tree = join(workspace, 'results', 'tasks', 'a', 'EXEC-1')
    const wrote = writeSidecar(tree, { ...facts, sessionId: 'S-9' })
    expect(wrote).toBe(join(tree, SIDECAR_NAME))
    const written = JSON.parse(readFileSync(wrote as string, 'utf8'))
    expect(written).toMatchObject({ formatVersion: 1, executionId: 'EXEC-1', sessionId: 'S-9' })
  })

  it('omits an absent sessionId rather than recording null', () => {
    const tree = join(workspace, 'results', 'tasks', 'a', 'EXEC-2')
    const written = JSON.parse(readFileSync(writeSidecar(tree, facts) as string, 'utf8'))
    expect('sessionId' in written).toBe(false)
  })

  it('never fails a run that succeeded, even when the tree cannot be annotated', () => {
    // A file where the directory should be: mkdir fails, and so must not throw.
    const blocked = join(workspace, 'blocked')
    writeFileSync(blocked, 'not a directory', 'utf8')
    expect(writeSidecar(join(blocked, 'EXEC-1'), facts)).toBeUndefined()
  })
})

describe('replacing the managed block', () => {
  const START = '# >>> rheplicant-agent (managed) >>>'
  const END = '# <<< rheplicant-agent (managed) <<<'
  const BLOCK = `${START}\n/results/\n${END}`

  it('appends to a file that has no block, keeping a trailing newline', () => {
    expect(replaceManagedBlock('node_modules/\n', BLOCK)).toBe(`node_modules/\n${BLOCK}\n`)
  })

  it('adds the missing newline when the file did not end with one', () => {
    expect(replaceManagedBlock('node_modules/', BLOCK)).toBe(`node_modules/\n${BLOCK}\n`)
  })

  it('writes only the block into a project that has no .gitignore', () => {
    expect(replaceManagedBlock('', BLOCK)).toBe(`${BLOCK}\n`)
  })

  it('leaves an already-current file completely alone', () => {
    expect(replaceManagedBlock(`a\n${BLOCK}\nb\n`, BLOCK)).toBeUndefined()
  })

  it('swaps a stale block in place, byte for byte on both sides', () => {
    const before = `a\n${START}\n/old/\n${END}\nb\n`
    expect(replaceManagedBlock(before, BLOCK)).toBe(`a\n${BLOCK}\nb\n`)
  })

  it('refuses a half-marked block rather than guessing where our text ends', () => {
    // A START with no END means someone truncated the file or deleted a
    // marker. Guessing the extent risks deleting lines the user wrote, which is
    // worse than failing to ignore a directory.
    expect(replaceManagedBlock(`a\n${START}\n/old/\n`, BLOCK)).toBeUndefined()
  })

  it('never matches an END that precedes the START', () => {
    // A scrambled file. Matching the earlier END would splice out every user
    // line between the two markers.
    const scrambled = `${END}\nkeep me\n${START}\n/old/\n`
    expect(replaceManagedBlock(scrambled, BLOCK)).toBeUndefined()
  })

  it('replaces the FIRST block when a copy-paste left two, and eats nothing between', () => {
    const twice = `${START}\n/old/\n${END}\nmine\n${START}\n/old/\n${END}\n`
    const after = replaceManagedBlock(twice, BLOCK)
    expect(after).toBe(`${BLOCK}\nmine\n${START}\n/old/\n${END}\n`)
    expect(after).toContain('mine')
  })
})
