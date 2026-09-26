# Hall artwork and calibration

All three owner-approved designs are integrated in this source handoff, with the later requested chamber and detail refinements. The Iron Man workshop uses silver architecture, red-and-gold pod frames and arc-reactor lighting. The final Batcave has black bat silhouettes, dark armoured cases and rock architecture. The final Spider-Man lab has crimson and midnight-blue chambers, web braces and spider emblems; it supersedes the earlier graphite lab.

Iron Man and Batman were made with the built-in image generator on 26 September 2026. No claim is made about its underlying model identifier. Spider-Man was directly modelled in Blender through Higgsfield 3D Jutsu and rendered in Eevee, using original geometry and materials. Editable scene: https://higgsfield.ai/3d-jutsu/86a3ec7a-ca00-4107-84ab-2cd64b9efa20 (committed revision 2).

| Theme | External asset | Native dimensions |
|---|---|---|
| Armor Hall | assets/wallpaper/ironman-studio.jpg | 1630 × 965 |
| Batcave | assets/wallpaper/batcave-studio.jpg | 1630 × 965 |
| Web Lab | assets/wallpaper/spiderman-studio.jpg | 2430 × 1440 |

The final PNG outputs were encoded to JPEG at quality 97 without resizing. Full PNGs are supplied separately. HALL-PROMPTS.md preserves the image directions and the final Spider-Man scene specification. Earlier Higgsfield reference jobs were Iron Man 9d5bf4ec-1a80-4903-9117-24609543d33b, Batman 58a6e544-c31f-4317-9e0c-f6337725e02a and Spider-Man 1f86ea8f-49ce-4b61-b688-a386aa38330d; these are not the final installed images.

Each plate has seven empty display openings and an empty low central dais. The fronts are clear because the app draws the animated glass. Existing GLB suits, centre media, labels and controls remain live; none is baked into the artwork. Hulkbuster, Absolute Batman and Iron Spider have wider bays. Both width and height constrain model fitting, keeping accessories inside the overview pods.

Each assets/wallpaper/*-empty.json records the native dimensions, interior bounds and foot positions. config/themes.json supplies matching click targets, labels and centre positions. Both hall renderers use the same contain transform. End-pod zooms stay inside the artwork bounds. Native labels ignore the old SVG fitter's offsets and scale; the centre holograms start below the pod interiors.

Replacing a plate requires recalibrating both JSON files, running the frontend tests and inspecting the actual models. Large media remains in external assets/, with no new runtime dependency or network request.

## Showcase refinement

Iron Man now has wider Mark One and Hulkbuster clear openings while retaining the approved workshop design. Batman retains the black bat/cave design with taller chambers. Their latest native plates are 1630 × 965. The Web Lab was rendered again from committed scene revision 2 through query operation a6ad84d4-2c78-47db-bc60-35bbaef0613a at 2430 × 1440, eight Eevee samples with ray tracing disabled; the camera and materials are retained, while floor reflections differ. Calibration pixel bounds were scaled by 1.5 and the actual models were checked. Failed 3240px Blender attempts and a different-lighting GLB render are not included.

The images are genuinely empty plates. The runtime editor stores normalised local overrides; see SHOWCASE-CALIBRATION.md. Higher-resolution suit textures and videos are not claimed.
