/**
 * Type declarations for the two stylesheets this half imports for their SIDE
 * EFFECT.
 *
 * The build inlines each CSS file as one `<style data-plugin>` tag at factory
 * execution (see `cssInlinePlugin` in `tsdown.config.ts`), so the import binds no
 * value — but `tsc` still has to resolve the specifier, and `moduleResolution:
 * "bundler"` has no declaration for `*.css` on its own.
 *
 * Both files are declared here rather than one wildcard nothing owns, so the two
 * import sites in `index.tsx` are visible in one place. `windows-client` owns
 * `windows/windows.css`; this file declares its TYPE only and never its contents.
 *
 * @module dsh-meta-market/client/shell/styles
 */

declare module '*.css' {
  const stylesheet: string
  export default stylesheet
}
