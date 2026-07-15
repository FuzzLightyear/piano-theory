# Piano Theory

An interactive 3D piano for exploring chords and scales in the browser —
**[try it live](https://fuzzlightyear.github.io/piano-theory/)**. Pick a
root and a pattern and the keyboard lights up the notes, with gem markers on
each pattern tone; click keys (or drag across them) to hear a synthesized
piano, or hit Play to run the scale up and down. The computer keyboard works
too: the home row plays naturals, the row above plays sharps, and Z/X shift
the octave.

Built with plain HTML, CSS, and JavaScript. No frameworks, no build step, no
npm, no runtime dependencies of any kind — the keyboard is real CSS 3D
geometry rather than canvas or WebGL, and the piano sound is synthesized from
scratch with the Web Audio API. The two fonts are subset and served from this
repo (SIL OFL, license texts in `fonts/`), so the app makes no third-party
requests at all. Keeping the dependency surface at zero is a deliberate design
constraint, not an accident of scope.

## Running

Serve the repo root with any static file server:

    python -m http.server

then open <http://localhost:8000/>. An HTTP origin is required because the
chord and scale definitions are fetched at runtime.

## Defining chords and scales

All musical content lives in [`data/patterns.txt`](data/patterns.txt) and uses
scale-degree notation, the same shorthand theory books use — degrees 1 to 13,
with `b` or `#` prefixes for flats and sharps:

    [Scales]
    blues:  Blues scale   = 1 b3 4 b5 5 b7

    [Chords]
    dom7:   Dominant 7th  = 1 3 5 b7
    maj9:   Major 9th     = 1 3 5 7 9

Degrees 9, 11, and 13 reach past the octave, so extended chords work exactly
as written. The parser is strict on purpose: unknown tokens, duplicate ids,
and out-of-order degrees fail with a line number instead of silently drawing
the wrong notes.

## Circle of fifths

The Circle button in the View group opens a circle-of-fifths panel that stays
linked to the keyboard: whatever pattern is highlighted on the keys is also
lit on the circle, with the root in orange. This is where the circle earns
its keep — a major scale is always seven *consecutive* wedges, a pentatonic
five, so you can see at a glance why those notes belong together and how
neighbouring keys overlap. Clicking a wedge re-roots the keyboard to that
key, the centre shows the key signature for major and minor patterns, and
the Fifths button walks the full circle from the current root — twelve
fifths landing back home.

## Sound

Each note is a bank of sine partials with stretched, slightly inharmonic
tuning — stronger in the bass, the way stiff piano strings actually behave —
plus per-partial decay, a touch of detune for multi-string beating, and a
band-passed noise burst for the hammer. Notes feed a shared compressor bus
with a convolver reverb whose impulse is synthesized at startup (dry, room,
and hall presets). An octave row shifts everything that sounds by up to two
octaves either way — like the octave buttons on a hardware controller, it
transposes the audio while the visual keyboard stays put, so you can view a
narrow range and still reach the registers around it.

## Tests

Open [`tests/tests.html`](tests/tests.html) from the same local server. The
page carries its own small assertion harness; one test fetches the shipped
pattern file and checks every definition against known interval sets.

## License

MIT for the code. The bundled fonts (Space Grotesk, Manrope) are under the
SIL Open Font License; their license texts live in [`fonts/`](fonts/).
