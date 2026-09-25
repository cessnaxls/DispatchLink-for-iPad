# DispatchLink iPad v1.2

Git + Render iPad-oriented DispatchLink web app.

## Live aircraft generator
- Global Live only; FAA generator removed.
- No API keys or environment secrets required.
- Primary live source: ADSB.lol.
- Automatic fallback: Airplanes.live.
- Samples current airborne aircraft in multiple high-traffic world regions.
- Registration prefix, manufacturer, and model/type substring filters.
- HexDB is used opportunistically for manufacturer/operator/serial/year enrichment.

## Deploy
Upload the CONTENTS of this folder to the root of your GitHub `main` branch. `render.yaml` must be visible at the repository root. Create a Render Blueprint from the repository.
