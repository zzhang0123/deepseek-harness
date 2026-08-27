/**
 * The run's name inside a panel that already has a title.
 *
 * A CAPTION, not a heading. Every viz panel opened its body with
 * `<strong>{run.name}</strong> ({run.kind})` at full weight, directly under a
 * panel header naming the same panel — so a reader met two titles and learned
 * one thing. What the line is actually for is telling two runs apart when a
 * document declares more than one; at that job it is a label, and it is
 * styled as one.
 *
 * In `ui-kit` because three of the four panels that need it have no stylesheet
 * of their own, and because "the run's name inside a titled panel" is one idea
 * rather than four.
 *
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/panel/RunHeading
 */
import { memo } from 'react'
import styles from './panel.module.css'

export const RunHeading = memo(function RunHeading({ name, kind }: {
  readonly name: string
  readonly kind: string
}) {
  return (
    <div className={styles.runHeading} data-run-heading={name}>
      {name} <span className={styles.runHeadingKind}>({kind})</span>
    </div>
  )
})
