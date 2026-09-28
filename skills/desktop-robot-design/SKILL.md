---
name: desktop-robot-design
description: "Turn desktop-robot hardware assemblies and passports into auditable engineering handoffs: missing-data manifests, sourced off-the-shelf parts, parametric CAD, URDF/SDF robot descriptions, printable meshes, and visual review. Use when designing the physical desktop robot, exporting its assembly, creating an enclosure or bracket, adding joints/frames, preparing simulation, or checking manufacturability. Do not use for runtime conversation/persona skills."
---

# Desktop Robot Design

Treat the Studio layout as product intent, not dimensional CAD. Never convert its `x`/`y` percentages into physical coordinates. Use `position_mm`, `rotation_rpy_deg`, component `physical` metadata, drawings, measurements, or explicit assumptions.

## Workflow

1. Read the assembly or passport and call `build_design_manifest` / `/api/assembly/design-export` to expose missing engineering data.
2. Resolve named commercial parts with `$step-parts` before drawing placeholders. Record the selected part ID, source URL, checksum, and local STEP path in `PhysicalSpec`.
3. Ask for fit-critical dimensions only when the manifest cannot be made truthful without them. Otherwise keep the output provisional and list every assumption.
4. Use `$cad` for chassis, brackets, shells, adapters, and assemblies. Keep source in `models/src/` and raw artifacts in `models/STEP/`, `models/STL/`, `models/3MF/`, or `models/GLB/`.
5. Use `$urdf` after frames, link poses, joint axes, limits, masses, and mesh units are explicit. Treat the API's URDF as a provisional handoff; audit its ledger and edit the `.urdf` directly as the canonical artifact.
6. Use `$sdf` only when a simulator/world deliverable is required; derive it from the audited URDF where possible.
7. Run `$dfam-check` on the exact printable mesh before `$gcode`.
8. Hand STEP, mesh, URDF, or SDF artifacts to `$cad-viewer` for visual review.

## Guardrails

- Keep design/manufacturing capabilities separate from robot runtime skills in `desktop_robot.skills.catalog`.
- Use millimeters/grams/degrees in the assembly manifest and convert to meters/kilograms/radians only at URDF/SDF boundaries.
- Compute inertia from known geometry and mass. Omit it when either is unknown.
- Mark catalog envelopes and guessed placement as `estimated` or `placeholder`; never label them exact.
- Preserve `avatar.glb` as the appearance track. Use CAD-derived GLB/3MF/STL for physical geometry and collision work.
- Validate authored URDF with `cadgen urdf validate --strict` and return a CAD Viewer link when the dependency is available.

Read [references/data-contract.md](references/data-contract.md) when changing assembly fields, API payloads, or handoff status.
