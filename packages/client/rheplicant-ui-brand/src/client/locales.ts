/**
 * Rheplicant brand copy.
 *
 * A namespace of our own rather than an override of `conversation`'s, because
 * there is no such thing: `LocaleRuntime.register` THROWS on a duplicate
 * `(namespace, locale)` pair — *"a namespace's texts have one owner"* — and the
 * throw takes down whichever plugin registered second. Measured 2026-08-26
 * before the headline slot was added, and it is why the slot exists.
 *
 * @module @rheplicant/dsh-rheplicant-ui-brand/client/locales
 */

/** This package's translation namespace. */
export const NS = 'rheplicant.brand'

/** Simplified Chinese brand copy. */
export const zh = {
  /**
   * The blank-session headline, one character from the shipped
   * `探索未至之境`: 未至 (not yet reached) becomes 未见 (not yet seen). The
   * radio sky is not somewhere nobody has been — it is overhead all day and
   * no eye registers it.
   */
  'hero.headline': '探索未见之境',
} satisfies Record<string, string>

/** Translation keys this namespace owns. */
export type BrandKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Rheplicant brand copy. */
    'rheplicant.brand': BrandKey
  }
}

/** English brand copy. */
export const en = {
  /**
   * `Into the Unseen Sky` — the shipped line is `Into the Unknown`, and this
   * keeps its shape, its prefix and its syllable count while replacing the one
   * word that claimed nothing. "Unseen" is the literal condition of a radio
   * sky; "unknown" was a posture.
   *
   * The `Into` is deliberate and was nearly lost. An earlier draft read
   * `Beneath the Turning Sky`, argued from the instrument: a drift-scan array
   * does not chase the sky, it waits while the Earth turns. True of the dish,
   * wrong for this screen — the hero addresses a person about to start work,
   * under a composer that says "describe what you want to build". A surface
   * that posed as the instrument would have said the opposite of what its
   * reader was doing.
   */
  'hero.headline': 'Into the Unseen Sky',
} satisfies Record<BrandKey, string>
