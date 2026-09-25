# DispatchLink iPad 1.1

Git + Render web port of DispatchLink.

## Working in this milestone
- FAA / US random aircraft assignment using the FAA Releasable Aircraft registry
- Make includes / Model includes filtering
- 7-day server cache with FAA fallback download URLs
- Optional HexDB enrichment for Mode-S/operator
- Global Live assignment using OpenSky airborne states + HexDB metadata
- Registration prefix / make / model filters
- FR24 paste parser, history table/filtering, random rig builder and SimBrief launcher
- iPad touch UI; no database

## Render
Push the repository to GitHub and create a Render Blueprint. `render.yaml` is included.

OpenSky credentials are optional. For authenticated live searches, set `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` in Render. Do not commit secrets to Git. FAA assignment does not require OpenSky.
