# Engineering handoff contract

## Assembly fields

- `x`, `y`, `z`, `rotation`, `scale`: Studio presentation/layout only; never use for kinematics.
- `position_mm`: component-link origin expressed in `parent_frame`.
- `rotation_rpy_deg`: roll, pitch, yaw from `parent_frame` to the component link at zero pose.
- `joint`: explicit joint type, axis, limits, effort, velocity, positive-motion description, and source.
- `physical_override`: instance-specific dimensions, mass, CAD/mesh paths, units, provenance, and confidence.

Catalog `physical` values are defaults. Instance overrides win only for fields explicitly supplied.

## Status

`ready` means every mounted component has dimensions, mass, and metric placement. It does not mean fit, collision clearance, wiring bend radius, structural strength, thermal performance, or certification has been proven.

`provisional` means the manifest contains `missing_engineering_data`. A provisional URDF is useful for frame review, but must not be presented as a production or simulation-accurate robot.

## API

POST `/api/assembly/design-export`:

```json
{
  "robot_name": "desk_friend",
  "assembly": {
    "board_id": "board.pi-zero-2w",
    "components": []
  }
}
```

The response contains `manifest`, `urdf`, and `provisional`. Save and audit the URDF only when a concrete robot-description deliverable is requested.
