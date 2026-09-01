# AIRLOCK design direction

## Subject and job

AIRLOCK is a pre-deployment safety range for engineers building browser agents.
The page has one job: make the difference between an unprotected run and a
policy-guarded run obvious before the viewer reads an architecture diagram.

## Visual system

- **Cold enamel** `#e8edf2` — the test bay and primary surface.
- **Carbon** `#111820` — text and instrument panels.
- **Safety blue** `#1648d8` — trusted control-plane actions.
- **Impact orange** `#f45b37` — exploit propagation and failed assertions.
- **Instrument white** `#f8fafb` — browser frames and report cards.
- **Steel** `#718090` — secondary labels and ruled structure.

Barlow Condensed is used only for the wordmark and impact-scale headlines;
Source Sans 3 carries explanations; IBM Plex Mono labels evidence and policy
decisions. The vocabulary comes from crash labs—test bays, impact moments,
restraints, and evidence—not generic cybersecurity neon.

## Layout

```text
┌ AIRLOCK / AGENT CRASH LAB                         SOURCE · RUN LOCALLY ┐
├───────────────────────────────────────────────────────────────────────┤
│ Would your agent obey the page—or you?  │  UNSHIELDED │  AIRLOCKED   │
│ short thesis + run control              │  synced browser test sled  │
├─────────────────────────────────────────┴─────────────────────────────┤
│ TEST MATRIX     six attacks · safety and task completion verdicts     │
├──────────────────────────────────────┬────────────────────────────────┤
│ OUT-OF-BAND EVENT LEDGER             │ POLICY BRAKE / evidence detail │
├──────────────────────────────────────┴────────────────────────────────┤
│ Solari range protocol: sandbox → browser pair → independent verdict   │
└───────────────────────────────────────────────────────────────────────┘
```

## Signature

The signature is a synchronized twin-browser **impact bay**. One playhead
drives both runs through the same actions. At the dangerous submit, the left
track carries the canary across the boundary while the right track visibly
hits a blue policy brake. It is both the hero and a truthful visualization of
the product's core experiment.

## Self-critique

The first direction leaned toward the familiar black-and-acid-green security
dashboard. That would make AIRLOCK interchangeable with a threat-monitoring
template. The revised cold crash-lab palette, asymmetric browser sled, and
physical test vocabulary are specific to comparative agent testing. Motion is
concentrated in the single synchronized impact sequence; the rest stays quiet.
