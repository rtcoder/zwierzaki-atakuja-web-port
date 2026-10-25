# AI asset runtime integration

> **For agentic workers:** use subagent-driven-development for independent pipeline and visual alignment work; root integrates and verifies.

**Goal:** Ship the approved refreshed candidates in the local playable game with original game geometry and clean compositing.
**Architecture:** Build all 105 runtime PNGs from assets-ai/images at original logical dimensions ×4. Normalize only unprepared sprite padding, preserve repaired atlas cells, record candidate/source hashes. Keep source archives intact. Update renderer only where generated overlays need explicit alignment.
**Stack:** Existing vanilla JS/Canvas, Python/Pillow build-time processing, Node test runner.
**Spec:** User-approved assets in assets-ai/README.md and request to integrate into game.

- [x] Build reproducible runtime packaging; exact source and logical geometry provenance, bounded decoded memory.
- [x] Inspect launcher assembly and target blinking with new sprites; avoid opaque mismatched rectangular patches.
- [x] Update integrity checks and focused regression coverage; refresh public description/provenance.
- [x] Run full Node tests and integrity check; play desktop/mobile, inspect all five themes and representative abilities.
- [x] Preserve all sources and old raw generations; report actual limitations and validation.

No unrelated physics changes. No automatic publication requested in this integration task. Runtime frame/glyph rects, collision sizes, pivots and level data must remain consistent.
