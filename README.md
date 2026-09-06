# shape pixel

Pixelation, but the pixels aren't square.

Upload an image, pick a primitive — hexagon, triangle, star, your own SVG — and
the renderer rebuilds the picture out of those instead of square blocks. Any
image metric can drive any visual property, so you can map luminance to size for
a halftone, hue to rotation for something weirder, or brightness to *which shape
gets drawn*. Exports PNG or print-ready SVG.

Runs entirely in the browser. Nothing is uploaded anywhere, and there is no
default image — the canvas waits for yours.

## why this exists

Halftone and mosaic filters are everywhere and they all bake in one decision:
this metric drives that property, take it or leave it. The interesting part
isn't hexagons, it's the mapping engine — `metric → invert → curve →
lerp(min,max) → clamp`, with eleven metrics on one end and five properties on
the other. Hexagons are just the first thing you reach for once that exists.

## the three things that make it work

**Every primitive is a `Path2D` built from an SVG path string.** The same string
the canvas fills is the one the SVG exporter writes into `<defs>`. Raster and
vector output are the same geometry by construction, not by two code paths
agreeing to behave. Adding a primitive is one `case` returning a `d` string.

**Sampling downsamples once, then samples many.** A box-filtered mip *is* the
per-cell average, computed for free by the resampler. So `average` mode costs
the same as `center` for every grid type — no intersecting hexagons with the
source raster. Everything upstream of that runs in linear light: sRGB is decoded
before luminance and averaging, then re-encoded on the way out. Skip the decode
and size mappings bunch into the midtones while averaged colours go muddy.

**The field ends on whole cells.** Offset rows are the reason this needs
saying: a staggered or hex row starts half a cell over, so left to itself every
other row terminates in a shape sliced by the canvas edge. `Edge: whole` sizes
and centres the grid to fit complete shapes and drops anything still hanging
over, which for hexagons means the boundary is an interlocked zigzag rather than
a straight cut — the only honest way to end a honeycomb. `Edge: bleed` restores
the full-bleed behaviour.

**Zoom is a view transform, never a render parameter.** Scroll to zoom, drag to
pan, double-click or `0` to fit, `+`/`-` to step, and hold `H` to A/B against
the source image under the same transform. Zooming re-renders the same cell
list at a different magnification rather than re-laying out the grid, so shapes
stay vector-crisp at 3200% and the cell count never moves. It is also cheap:
the pipeline result is cached, so a pan costs a draw pass (~6ms) and not a
resample. Exports ignore the viewport — you get the artwork, not the crop you
happen to be looking at.

**Layout is specified in columns, not pixels.** Cell size is derived from output
width ÷ columns, so "export at 4×" is a pure scale of the same cell positions.
No re-layout, no re-sample, no 276 MB float buffer. The `CellStyle[]` list the
preview produced is exactly what the exporter serialises.

## running it

```
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

Pushing to `master` deploys to GitHub Pages. `base` is `./` so it works from any
path.

## how it's put together

```
src/core/       the renderer, environment-agnostic
  color        sRGB <-> linear, Rec.709 luminance, Oklab, hex
  primitives   unit-box path strings + Path2D cache
  grid         rect / staggered / hex / triangle / polar / scatter
  source       fit + crop + linear decode + contrast/brightness
  sampler      mip build, bilinear, true median
  metrics      Sample -> [0,1], and the mapping pipeline
  quantize     median cut, Oklab matching, Bayer dither
  pipeline     cells -> sample -> metrics -> mapping -> CellStyle[]
  renderRaster / renderSvg    two consumers of that one list

src/worker/     engine.ts is the whole renderer; the worker is a 5-line adapter
src/app/        store, render host, image + SVG loading
src/ui/         hand-rolled controls, no framework
```

`RenderConfig` is the store shape, the preset file *and* the URL state. One
type, one sanitiser, no drift. Everything arriving from outside — a pasted
hash, a loaded preset — goes through `sanitizeConfig`, so a hand-edited URL
gives you a boring render rather than a broken worker.

Rendering runs in a Web Worker with `OffscreenCanvas`. While you're dragging a
slider it renders a draft (columns capped at 60, median sampling swapped out)
and does the real pass on release. If module workers aren't available the
identical engine runs inline instead.

## deliberate deviations from the spec

- **`<defs><path id>` + `<use>`, not `<symbol>`.** A symbol with no viewBox
  needs `overflow:visible` to avoid clipping and Illustrator is inconsistent
  about honouring it. `<use>` on a path is boring and works everywhere.
- **The hexagon breaks the unit box.** It's sized flat-to-flat = 1 so it tiles
  its own grid seamlessly at gap 0, which puts it at 1.1547 across the points.
  Tiling won that argument. (Verified: 0% background visible at gap 0, for
  hexagons in both orientations, triangles and squares.)
- **Custom SVG normalises on the main thread.** `getBBox()` on a detached SVG
  element is exact and free; reimplementing bezier and arc extrema to keep it in
  the worker would be a few hundred lines to do worse.
- **`strokeColor` was added to `RenderConfig`.** The spec lists it as a mappable
  property but never gives it a field, and you can't draw a stroke without one.
  `"source"` means "reuse the cell's own colour".
- **`edge` was added to `RenderConfig`.** The spec never says what happens at
  the boundary, and the default answer — clip whatever the canvas cuts — leaves
  half-shapes down the sides of every offset grid.
- **No bundled images at all.** The spec wants a demo image loaded on open "so
  the canvas is never empty" plus sample images shipped with the app. There are
  neither: the canvas starts empty and waits for your upload. Nothing to
  licence, nothing to ship, no binary blobs in the repo.

## not built

`dominant` sampling and k-means palettes — both marked stretch in the spec, and
median cut plus Oklab matching already covers the ground. Everything else in
phases 1–4 is in, including polar and scatter grids and the glyph primitive.
