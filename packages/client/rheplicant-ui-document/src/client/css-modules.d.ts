/** Ambient shape for CSS Module imports — this package's only .css consumers. */
declare module '*.module.css' {
  const classes: { readonly [className: string]: string }
  export default classes
}
