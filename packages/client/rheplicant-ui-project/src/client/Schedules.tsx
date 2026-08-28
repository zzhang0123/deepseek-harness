/**
 * The Schedules board: everything this harness will do on its own, in the order
 * it will do it.
 *
 * **Why this is a destination and not a third tab on the dashboard.** The
 * Setups tab answers *what does this project have set up*, and orders by
 * project and task to answer it. This answers *what is going to happen next*,
 * and orders by the clock. `project-model.md` §28's rubric is to write down
 * what question each surface answers and merge anything where the answers
 * coincide — these do not coincide, and neither ordering can serve the other
 * question without becoming the wrong list.
 *
 * **Cards, not rows, and the reason is what a schedule IS.** The first cut was
 * a seven-column table and it read like a log file: a project, a name, a kind,
 * a subject, a cadence, a fire time and a switch, all at one size in one grey,
 * with nothing leading the eye. But a schedule is not a record to scan — there
 * are five of them, not five hundred — it is a small standing INTENTION, and
 * the three things a person actually asks of one are *what is it called*,
 * *what does it do*, and *is it on*. A card can put those three in a reading
 * order; a row can only put them in columns. The vocabulary is `ui-docs`'
 * (`docs.module.css`'s `.card` / `.cardTag` / `.cardTitle` / `.cardBody`),
 * borrowed rather than invented so the two surfaces are one design.
 *
 * **What this board cannot show, said on the board.** DSH's own
 * `schedule_create` reminders live in a SESSION's event log and are folded by
 * that session; there is no host-side registry of them, and folding every
 * persisted log to find them would produce a list whose rows mostly cannot
 * fire — a session-local reminder only fires while its session is live. So the
 * board holds triggers, and says so, rather than holding some of the schedules
 * under a heading that claims all of them.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/Schedules
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { Badge } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { useHome } from './home-store.ts'
import { useAllProjects } from './use-all-projects.ts'
import { setTriggerEnabled } from './project-overview-client.ts'
import { canNavigate, openSession } from './navigate.ts'
import {
  allTriggers, nextFireLabel, scheduleBoard, unreadableRegistries,
  type DashboardTrigger,
} from './dashboard-selectors.ts'
import styles from './schedules.module.css'

/** One workspace row, as the registry hands it over. */
interface WorkspaceRow {
  readonly workspaceId: string
  readonly title: string
}

interface SchedulesProps {
  useWorkspaces: <T>(selector: (state: { items: readonly WorkspaceRow[] }) => T) => T
}

/** A trigger's identity within the whole harness, for keying local state. */
function keyOf(trigger: DashboardTrigger): string {
  return `${trigger.workspaceId} ${trigger.name}`
}

/** What one card says it will do — the description under its title. */
function descriptionOf(trigger: DashboardTrigger): string {
  return trigger.action === 'routine'
    ? trigger.prompt ?? ''
    : trigger.task ?? ''
}

/** One card. */
const ScheduleCard = memo(function ScheduleCard({
  trigger, enabled, error, now, onToggle,
}: {
  trigger: DashboardTrigger
  enabled: boolean
  error: string | undefined
  now: number
  onToggle: (trigger: DashboardTrigger) => void
}) {
  const routine = trigger.action === 'routine'
  return (
    <li
      className={styles.card}
      data-schedule={trigger.name}
      data-schedule-action={trigger.action}
      data-schedule-enabled={String(enabled)}
    >
      <div className={styles.cardHead}>
        {/* The kind first and in the accent, because it is the one fact that
            changes what a firing COSTS: a task run spends compute the person
            already owns, a routine spends a model call. */}
        <span className={styles.tag} data-schedule-kind={trigger.action}>
          {routine ? 'routine' : 'task'}
        </span>
        {/* STILL NO "start a session from this card". That control was built,
            then removed, because of what such a session would KNOW: it would be
            the project's reusable BLANK session, carrying none of the
            schedule's name, prompt, cadence or state — an agent that cannot
            answer "change it to nine" because it has no idea what "it" is.
            `navigate.ts` reaches the same verdict for tasks and executions:
            *"carrying a task to a place that cannot use it is not
            navigation."* Nothing about that has changed; the composer's draft
            still lives in a `ui-conversation`-private store, and writing
            another package's persisted key is a trespass rather than a seam.

            What the card offers instead is the session a firing ALREADY
            opened — see the footer. It needs nothing carried to it, because
            `routine.ts`'s framing states the routine's name, cadence,
            occurrence and prompt in that session's first message. */}
        <button
          type="button"
          className={styles.switch}
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${trigger.name}`}
          data-schedule-toggle={trigger.name}
          onClick={() => { onToggle(trigger) }}
        >
          <span className={styles.knob} />
        </button>
      </div>

      <h3 className={styles.cardTitle}>{trigger.name}</h3>

      {/* Verbatim, clamped to two lines rather than truncated to one: a routine
          prompt is a sentence and the first eight words of it are not what it
          says. The whole of it is on the title for a hover. */}
      <p
        className={routine ? styles.cardBody : styles.cardBodyPath}
        title={descriptionOf(trigger)}
      >
        {descriptionOf(trigger)}
      </p>

      <div className={styles.meta}>
        {/* Verbatim (§27.2): `PT10M` and `08:00` are what the person wrote and
            what `rheplicant_trigger` takes back. The KIND is marked rather than
            flattened — an interval is measured from the last attempt and slides
            later every time the harness was down; a wall clock does not. That
            is the one difference between them a person acts on. */}
        <code className={styles.cadence} data-cadence-kind={trigger.cadenceKind}>
          {trigger.cadenceKind === 'dailyAt' ? `@ ${trigger.cadence}` : trigger.cadence}
        </code>
        <span className={styles.fire}>
          {enabled ? nextFireLabel(trigger, now) : 'not running'}
        </span>
        <span className={styles.project}>{trigger.project}</span>
      </div>

      {/* THE SESSION THIS ROUTINE IS IN, or was in last. Rendered only when
          all three of its conditions hold, and each is a different absence:
          a task trigger opens no session at all; a routine that has not fired
          has none yet; and a page whose composition installed no navigator
          cannot open one — `navigate.ts` calls that the honest degradation for
          a harness mounted without a conversation surface.

          It does not claim the session is still there. The id was written when
          a firing opened it and a session can be deleted afterwards, so this
          asks the host and lets the host answer, rather than checking first and
          rendering a promise it cannot keep.

          "Open" rather than "Open last session": the label sits under a card
          that already says which routine this is, and the word `last` would be
          wrong for the case this exists to serve — a routine running right
          now, whose session was recorded the moment it opened. */}
      {routine && trigger.lastSessionId !== undefined && canNavigate() && (
        <div className={styles.cardFoot}>
          <button
            type="button"
            className={styles.cardAction}
            data-schedule-open-session={trigger.name}
            onClick={() => { openSession(trigger.lastSessionId ?? '') }}
          >
            Open its session
          </button>
        </div>
      )}

      {/* Absent for a routine, which names no task — `unknown` is a real claim
          (*cannot tell if this task is here*), so borrowing it to mean "there
          is no task to look for" would put two facts under one badge. */}
      {trigger.taskPresence !== undefined && trigger.taskPresence !== 'present' && (
        <div className={styles.flag}>
          {trigger.taskPresence === 'missing'
            ? <Badge state="failed">names a task that is not here</Badge>
            : <Badge state="off">cannot tell if this task is here</Badge>}
        </div>
      )}

      {/* On the card that failed, never as a page-level fault: the others are
          fine, and one of them is probably the one to reach next. */}
      {error !== undefined && (
        <p className={styles.cardError} data-schedule-error={trigger.name}>{error}</p>
      )}
    </li>
  )
})

export const Schedules = memo(function Schedules({ useWorkspaces }: SchedulesProps) {
  const { section } = useHome()
  const [nonce, setNonce] = useState(0)
  // What a toggle has done that the fetched cards do not know about yet, and
  // what a toggle FAILED to do. Keyed by trigger so two cards never share a
  // state, and cleared by the refetch a success schedules.
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<Record<string, string>>({})
  const workspaces = useWorkspaces(state => state.items)
  const { loading, cards } = useAllProjects(workspaces, nonce)

  const triggers = useMemo(() => allTriggers(cards), [cards])
  const board = useMemo(() => scheduleBoard(triggers), [triggers])
  const unreadable = useMemo(() => unreadableRegistries(cards), [cards])
  const now = Date.now()

  const toggle = useCallback(async (trigger: DashboardTrigger) => {
    const key = keyOf(trigger)
    const next = !(pending[key] ?? trigger.enabled)
    // Optimistic, and reverted by deleting the override rather than by writing
    // the old value back: the card then shows what the HOST said, which is the
    // only state anything can act on.
    setPending(current => ({ ...current, [key]: next }))
    setFailed(({ [key]: _gone, ...rest }) => rest)
    const result = await setTriggerEnabled(trigger.workspaceId, trigger.name, next)
    if (result.ok) {
      // Refetch rather than trust the override: a registry someone else edited
      // between the read and the write has more news in it than this one card.
      setNonce(current => current + 1)
      setPending(({ [key]: _done, ...rest }) => rest)
      return
    }
    setPending(({ [key]: _undone, ...rest }) => rest)
    setFailed(current => ({ ...current, [key]: result.reason }))
  }, [pending])

  if (section !== 'schedules') return null

  const live = board.filter(trigger => pending[keyOf(trigger)] ?? trigger.enabled)
  const off = board.filter(trigger => !(pending[keyOf(trigger)] ?? trigger.enabled))

  const grid = (rows: readonly DashboardTrigger[]): JSX.Element => (
    <ul className={styles.cards}>
      {rows.map(trigger => (
        <ScheduleCard
          key={keyOf(trigger)}
          trigger={trigger}
          enabled={pending[keyOf(trigger)] ?? trigger.enabled}
          error={failed[keyOf(trigger)]}
          now={now}
          onToggle={trigger_ => { void toggle(trigger_) }}
        />
      ))}
    </ul>
  )

  return (
    <div className={styles.layer} data-rheplicant-schedules="">
      <section className={styles.page} aria-label="Schedules">
        <header className={styles.head}>
          <div className={styles.title}>
            <span className={styles.eyebrow}>all projects</span>
            <span className={styles.name}>
              {board.length === 1 ? '1 schedule' : `${board.length} schedules`}
              {live.length > 0 && <span className={styles.liveCount}>{live.length} running</span>}
            </span>
          </div>
          <button
            type="button"
            className={styles.action}
            data-schedules-refresh=""
            onClick={() => { setNonce(current => current + 1) }}
          >
            Refresh
          </button>
        </header>

        <div className={styles.body}>
          {/* Printed ALWAYS, because it is about what is not on this page, and
              an empty board is exactly when someone is most likely to conclude
              that nothing is scheduled anywhere. */}
          <p className={styles.boundary} data-schedules-boundary>
            Reminders you set inside a conversation are not here. They live in that
            session and run only while it is open.
          </p>

          {unreadable.length > 0 && (
            <ul className={styles.notices} data-schedules-unreadable>
              {unreadable.map(entry => (
                <li key={entry.workspaceId} className={styles.notice}>
                  <Badge state="warn">unreadable</Badge>
                  <span>{entry.project}: {entry.reason}. Nothing in it will fire.</span>
                </li>
              ))}
            </ul>
          )}

          {board.length === 0 && (
            <p className={styles.empty} data-schedules-empty>
              {loading
                ? 'Reading projects…'
                : 'Nothing is scheduled. Ask the agent to run a task on a cadence, or to open a session on one.'}
            </p>
          )}

          {/* TWO GROUPS, not one sorted list with the dead half at the bottom.
              The board's first question is "what is going to happen", and a
              heading answers it in a word where position alone only implies
              it. §27.1's sentence rides the group it is actually about. */}
          {live.length > 0 && (
            <section className={styles.group} data-schedules-group="running">
              <h2 className={styles.groupHead}>Running</h2>
              <p className={styles.caveat} data-schedules-caveat>
                These fire only while this harness is running.
              </p>
              {grid(live)}
            </section>
          )}

          {off.length > 0 && (
            <section className={styles.group} data-schedules-group="paused">
              <h2 className={styles.groupHead}>Paused</h2>
              <p className={styles.caveat}>
                Set up, and switched off. Nothing here will fire.
              </p>
              {grid(off)}
            </section>
          )}
        </div>
      </section>
    </div>
  )
})
